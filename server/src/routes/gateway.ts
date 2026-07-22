import { Readable, Transform } from 'node:stream';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireAuth, requireRole } from '../auth.js';
import { GatewayService, BudgetExceededError, type ChatBody, type Usage } from '../gateway/gatewayService.js';
import { PolicyService, type PolicyKind } from '../services/policyService.js';
import { AuditService } from '../services/auditService.js';
import { config } from '../config.js';
import { redact } from '../privacy/redact.js';
import { semanticCache, extractPrompt } from '../gateway/cache.js';
import { classifyTask, nextTier, type Tier } from '../gateway/classifier.js';
import { getPlan, entitled, limitOf } from '../billing/entitlements.js';
import { events } from '../services/eventService.js';
import { agents } from '../services/agentService.js';
import { listModels, modelsPayload } from '../services/modelCatalog.js';

const gateway = new GatewayService();
const policies = new PolicyService();
const audit = new AuditService();

type Format = 'openai' | 'anthropic';

interface ProxyConfig {
  path: string;
  format: Format;
}

const OPENAI: ProxyConfig = { path: '/v1/chat/completions', format: 'openai' };
const ANTHROPIC: ProxyConfig = { path: '/v1/messages', format: 'anthropic' };

/** Registers the Gateway Plane: OpenAI + Anthropic proxies, policy + usage APIs. */
export async function registerGatewayRoutes(app: FastifyInstance): Promise<void> {
  // OpenAI-compatible (Cursor, Cline, Codex, Continue, …) — inference needs member.
  app.post('/v1/chat/completions', { preHandler: [requireAuth, requireRole('member')] }, (req, reply) => proxy(req, reply, OPENAI));

  // Anthropic-compatible (Claude Code → point ANTHROPIC_BASE_URL at the Hub)
  app.post('/v1/messages', { preHandler: [requireAuth, requireRole('member')] }, (req, reply) => proxy(req, reply, ANTHROPIC));

  // -- policy management (admin) --------------------------------------------
  app.get('/api/policies', { preHandler: requireAuth }, async (req) => {
    const kind = (req.query as { kind?: PolicyKind }).kind;
    return policies.list(req.auth!.orgId, kind);
  });

  app.post('/api/policies', { preHandler: [requireAuth, requireRole('admin')] }, async (req) => {
    const b = req.body as { kind: PolicyKind; spec: Record<string, unknown>; enabled?: boolean };
    const p = await policies.create(req.auth!.orgId, b.kind, b.spec, b.enabled ?? true);
    await audit.log(req.auth!.orgId, req.auth!.userId, 'policy.create', p.id, { kind: b.kind, spec: b.spec });
    return p;
  });

  app.delete('/api/policies/:id', { preHandler: [requireAuth, requireRole('admin')] }, async (req) => {
    const { id } = req.params as { id: string };
    await policies.remove(req.auth!.orgId, id);
    await audit.log(req.auth!.orgId, req.auth!.userId, 'policy.delete', id);
    return { ok: true };
  });

  // -- model catalog --------------------------------------------------------
  // OpenAI-standard model list (agents + external tools read this).
  app.get('/v1/models', { preHandler: [requireAuth, requireRole('member')] }, async () => modelsPayload());

  // UI-friendly: catalog + the org's current default model.
  app.get('/api/models', { preHandler: requireAuth }, async (req) => ({
    models: listModels(),
    default: await defaultModel(req.auth!.orgId),
  }));

  // Pick the org's default model — enforced Hub-side via a `model` policy.
  app.put('/api/settings/default-model', { preHandler: [requireAuth, requireRole('admin')] }, async (req, reply) => {
    const model = (req.body as { model?: string }).model?.trim();
    if (!model || !listModels().includes(model)) {
      return reply.code(400).send({ error: { code: 'bad_request', message: 'model must be one of the catalog models' } });
    }
    // Replace any existing default-chain model policy with the new choice.
    const existing = await policies.list(req.auth!.orgId, 'model');
    for (const p of existing) {
      if (Array.isArray((p.spec as { default_chain?: unknown }).default_chain)) await policies.remove(req.auth!.orgId, p.id);
    }
    await policies.create(req.auth!.orgId, 'model', { default_chain: [model] });
    await audit.log(req.auth!.orgId, req.auth!.userId, 'settings.default_model', model, { model });
    return { ok: true, default: model };
  });

  // -- connected agents -----------------------------------------------------
  app.get('/api/agents', { preHandler: requireAuth }, async (req) => agents.list(req.auth!.orgId));

  // -- usage summary --------------------------------------------------------
  app.get('/api/usage', { preHandler: requireAuth }, async (req) => {
    const [tokens, usd, budget] = await Promise.all([
      gateway.monthTokens(req.auth!.orgId),
      gateway.monthUsd(req.auth!.orgId),
      policies.budget(req.auth!.orgId),
    ]);
    return { period: 'month', tokens, usd: Number(usd.toFixed(6)), budget };
  });
}

/** Shared proxy handler for both inbound formats. */
async function proxy(req: FastifyRequest, reply: FastifyReply, cfg: ProxyConfig): Promise<void> {
  const orgId = req.auth!.orgId;
  const userId = req.auth!.userId;
  const body = (req.body ?? {}) as ChatBody;
  const task = typeof req.headers['x-hub-task'] === 'string' ? (req.headers['x-hub-task'] as string) : undefined;
  const plan = await getPlan(orgId);

  // Connected-agent detection (gateway path): who is calling + what model.
  // Prefer an explicit x-hub-agent; fall back to User-Agent but skip generic
  // HTTP clients (curl, requests, node…) so the list stays real agents only.
  const explicitAgent = req.headers['x-hub-agent'] as string | undefined;
  const ua = req.headers['user-agent'] as string | undefined;
  const agentName = explicitAgent ?? (ua && !isGenericHttpClient(ua) ? ua : undefined);
  if (agentName) {
    void agents.record({
      orgId, userId, rawName: agentName, source: 'gateway',
      model: body.model, project: req.headers['x-hub-project'] as string | undefined,
    });
  }

  // Plan limit: monthly gateway requests (free tier is capped).
  const reqLimit = limitOf(plan, 'monthlyRequests');
  if (Number.isFinite(reqLimit)) {
    const used = await gateway.monthRequests(orgId);
    if (used >= reqLimit) {
      void events.record('warn', 'gateway', 'limit_reached', `Monthly request limit reached (${used}/${reqLimit})`, orgId, { used, limit: reqLimit, plan });
      reply.code(402).send({ error: { code: 'limit_reached', message: `Monthly request limit reached (${used}/${reqLimit}). Upgrade for more.`, plan } });
      return;
    }
  }

  // Quality-based routing (paid): classify the prompt and pick a model tier.
  let quality: { tiers: Record<string, string>; escalateOnShort?: number } | undefined;
  let tier: Tier | undefined;
  if (!task && entitled(plan, 'quality_routing')) {
    quality = await policies.quality(orgId);
    if (quality && Object.keys(quality.tiers).length) {
      tier = classifyTask(extractPrompt(body));
      const tierModel = quality.tiers[tier];
      if (tierModel) {
        body.model = tierModel;
        reply.header('x-hub-tier', tier);
      }
    }
  }

  // PII/secret guardrail — redact or block before any provider call.
  if (config.redactionEnabled) {
    const found = scrubBody(body, config.redactionMode === 'redact');
    if (found > 0 && config.redactionMode === 'block') {
      void events.record('warn', 'gateway', 'redaction_block', `Blocked ${found} secret/PII item(s) in request`, orgId, { found });
      reply.code(422).send({ error: { code: 'sensitive_content', message: `Blocked: ${found} secret/PII item(s) detected` } });
      return;
    }
  }

  // Semantic cache (paid) — return a stored completion for a close prompt.
  const cacheKeyModel = body.model ?? 'default';
  if (semanticCache.enabled && entitled(plan, 'semantic_cache') && !body.stream) {
    const prompt = extractPrompt(body);
    const cached = await semanticCache.lookup(orgId, cacheKeyModel, prompt);
    if (cached !== undefined) {
      reply.header('x-hub-cache', 'hit');
      // Track what the cache saved (the cost the upstream call would have incurred).
      const savedUsage = cfg.format === 'anthropic' ? gateway.extractAnthropicUsage(cached) : gateway.extractOpenAIUsage(cached);
      const savedUsd = gateway.costOf(cacheKeyModel, savedUsage);
      await gateway.recordUsage(orgId, userId, cacheKeyModel, { inputTokens: 0, outputTokens: 0 }, {
        cached: true,
        saved_tokens: savedUsage.inputTokens + savedUsage.outputTokens,
        saved_usd: savedUsd,
        latency_ms: 0,
      });
      reply.send(cached);
      return;
    }
    reply.header('x-hub-cache', 'miss');
  }

  // Budget enforcement (before any provider call).
  try {
    await gateway.assertWithinBudget(orgId);
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      void events.record('warn', 'gateway', 'budget_exceeded', err.message, orgId, {});
      reply.code(429).send({ error: { code: 'budget_exceeded', message: err.message } });
      return;
    }
    throw err;
  }

  const t0 = Date.now();
  let result;
  try {
    result = await gateway.forwardTo(orgId, cfg.path, body, task, { injectStreamUsage: cfg.format === 'openai' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    void events.record('error', 'gateway', 'gateway_error', msg, orgId, { path: cfg.path });
    reply.code(400).send({ error: { code: 'gateway_error', message: msg } });
    return;
  }
  const { resp, model, triedModels } = result;

  reply.header('x-hub-model', model);
  reply.header('x-hub-tried', triedModels.join(','));

  if (!resp.ok) {
    const errText = await resp.text();
    let parsed: unknown = errText;
    try { parsed = JSON.parse(errText); } catch { /* keep text */ }
    void events.record('error', 'gateway', 'provider_error', `Provider returned ${resp.status} for ${model}`, orgId, { status: resp.status, model, tried: triedModels });
    reply.code(resp.status).send(parsed);
    return;
  }

  // Latency watchdog — flag unusually slow upstream calls for investigation.
  const elapsed = Date.now() - t0;
  if (elapsed > config.slowRequestMs) {
    void events.record('warn', 'gateway', 'slow_request', `Upstream call took ${elapsed}ms on ${model}`, orgId, { latency_ms: elapsed, model });
  }

  // Non-streaming: read JSON, meter precisely, return.
  if (!body.stream) {
    let json = await resp.json();
    let servedModel = model;

    // Quality escalation: if a cheap tier gave a too-short answer, retry once on
    // the next tier up.
    if (tier && quality?.escalateOnShort && quality.tiers) {
      const answer = extractText(json, cfg.format);
      const up = nextTier(tier);
      const upModel = up ? quality.tiers[up] : undefined;
      if (answer.length < quality.escalateOnShort && upModel) {
        const retry = await gateway.forwardTo(orgId, cfg.path, { ...body, model: upModel }, undefined, { injectStreamUsage: false });
        if (retry.resp.ok) {
          json = await retry.resp.json();
          servedModel = retry.model;
          reply.header('x-hub-escalated', `${tier}->${up}`);
        }
      }
    }

    const usage: Usage = cfg.format === 'anthropic' ? gateway.extractAnthropicUsage(json) : gateway.extractOpenAIUsage(json);
    reply.header('x-hub-model', servedModel);
    await gateway.recordUsage(orgId, userId, servedModel, usage, { latency_ms: Date.now() - t0 });
    if (semanticCache.enabled && entitled(plan, 'semantic_cache')) {
      void semanticCache.store(orgId, cacheKeyModel, extractPrompt(body), json);
    }
    reply.send(json);
    return;
  }

  // Streaming: pipe SSE through, capturing the tail to meter usage on end.
  reply.hijack();
  reply.raw.writeHead(200, {
    'Content-Type': resp.headers.get('content-type') ?? 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'x-hub-model': model,
  });

  if (!resp.body) {
    reply.raw.end();
    return;
  }

  let tail = '';
  const meter = new Transform({
    transform(chunk, _enc, cb) {
      tail = (tail + chunk.toString('utf8')).slice(-8000);
      this.push(chunk);
      cb();
    },
  });
  meter.on('end', () => {
    const usage: Usage =
      cfg.format === 'anthropic' ? gateway.parseAnthropicUsageFromSse(tail) : gateway.parseOpenAIUsageFromSse(tail);
    void gateway.recordUsage(orgId, userId, model, usage, { stream: true });
  });

  Readable.fromWeb(resp.body as never).pipe(meter).pipe(reply.raw);
}

/** True for generic HTTP clients we don't want to list as coding agents. */
function isGenericHttpClient(ua: string): boolean {
  return /^(curl|wget|python-requests|python-urllib|node|node-fetch|undici|axios|got|go-http-client|okhttp|postmanruntime|insomnia|java|libwww|httpie|guzzle|ruby|php)/i.test(ua.trim());
}

/** The org's currently-selected default model, if a model policy sets one. */
async function defaultModel(orgId: string): Promise<string | undefined> {
  const rows = await policies.list(orgId, 'model');
  for (const p of rows) {
    const chain = (p.spec as { default_chain?: unknown }).default_chain;
    if (Array.isArray(chain) && typeof chain[0] === 'string') return chain[0] as string;
  }
  return undefined;
}

/** Extracts assistant text from a completion (OpenAI or Anthropic shape). */
function extractText(json: unknown, format: Format): string {
  if (format === 'anthropic') {
    const blocks = (json as { content?: Array<{ type?: string; text?: string }> }).content ?? [];
    return blocks.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
  }
  return (json as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content ?? '';
}

/**
 * Scans a chat/messages body for secrets/PII. When `apply` is true it rewrites
 * the offending strings in place with redaction placeholders. Returns the total
 * number of sensitive items found.
 */
function scrubBody(body: ChatBody, apply: boolean): number {
  let found = 0;
  const handle = (s: string): string => {
    const r = redact(s);
    found += r.total;
    return apply ? r.text : s;
  };

  if (typeof body['system'] === 'string') body['system'] = handle(body['system'] as string);

  const messages = body['messages'];
  if (Array.isArray(messages)) {
    for (const m of messages as Array<{ content?: unknown }>) {
      if (typeof m.content === 'string') {
        m.content = handle(m.content);
      } else if (Array.isArray(m.content)) {
        for (const block of m.content as Array<{ type?: string; text?: string }>) {
          if (block && block.type === 'text' && typeof block.text === 'string') block.text = handle(block.text);
        }
      }
    }
  }
  return found;
}
