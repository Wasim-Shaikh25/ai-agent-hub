import { Readable, Transform } from 'node:stream';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireAuth } from '../auth.js';
import { GatewayService, BudgetExceededError, type ChatBody, type Usage } from '../gateway/gatewayService.js';
import { PolicyService, type PolicyKind } from '../services/policyService.js';

const gateway = new GatewayService();
const policies = new PolicyService();

type Format = 'openai' | 'anthropic';

interface ProxyConfig {
  path: string;
  format: Format;
}

const OPENAI: ProxyConfig = { path: '/v1/chat/completions', format: 'openai' };
const ANTHROPIC: ProxyConfig = { path: '/v1/messages', format: 'anthropic' };

/** Registers the Gateway Plane: OpenAI + Anthropic proxies, policy + usage APIs. */
export async function registerGatewayRoutes(app: FastifyInstance): Promise<void> {
  // OpenAI-compatible (Cursor, Cline, Codex, Continue, …)
  app.post('/v1/chat/completions', { preHandler: requireAuth }, (req, reply) => proxy(req, reply, OPENAI));

  // Anthropic-compatible (Claude Code → point ANTHROPIC_BASE_URL at the Hub)
  app.post('/v1/messages', { preHandler: requireAuth }, (req, reply) => proxy(req, reply, ANTHROPIC));

  // -- policy management ----------------------------------------------------
  app.get('/api/policies', { preHandler: requireAuth }, async (req) => {
    const kind = (req.query as { kind?: PolicyKind }).kind;
    return policies.list(req.auth!.orgId, kind);
  });

  app.post('/api/policies', { preHandler: requireAuth }, async (req) => {
    const b = req.body as { kind: PolicyKind; spec: Record<string, unknown>; enabled?: boolean };
    return policies.create(req.auth!.orgId, b.kind, b.spec, b.enabled ?? true);
  });

  app.delete('/api/policies/:id', { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    await policies.remove(req.auth!.orgId, id);
    return { ok: true };
  });

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

  // Budget enforcement (before any provider call).
  try {
    await gateway.assertWithinBudget(orgId);
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      reply.code(429).send({ error: { code: 'budget_exceeded', message: err.message } });
      return;
    }
    throw err;
  }

  let result;
  try {
    result = await gateway.forwardTo(orgId, cfg.path, body, task, { injectStreamUsage: cfg.format === 'openai' });
  } catch (err) {
    reply.code(400).send({ error: { code: 'gateway_error', message: err instanceof Error ? err.message : String(err) } });
    return;
  }
  const { resp, model, triedModels } = result;

  reply.header('x-hub-model', model);
  reply.header('x-hub-tried', triedModels.join(','));

  if (!resp.ok) {
    const errText = await resp.text();
    let parsed: unknown = errText;
    try { parsed = JSON.parse(errText); } catch { /* keep text */ }
    reply.code(resp.status).send(parsed);
    return;
  }

  // Non-streaming: read JSON, meter precisely, return.
  if (!body.stream) {
    const json = await resp.json();
    const usage: Usage = cfg.format === 'anthropic' ? gateway.extractAnthropicUsage(json) : gateway.extractOpenAIUsage(json);
    await gateway.recordUsage(orgId, userId, model, usage);
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
