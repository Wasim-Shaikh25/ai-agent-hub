import { Readable, Transform } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth.js';
import { GatewayService, BudgetExceededError, type ChatBody } from '../gateway/gatewayService.js';
import { PolicyService, type PolicyKind } from '../services/policyService.js';

const gateway = new GatewayService();
const policies = new PolicyService();

/** Registers the Gateway Plane: OpenAI-compatible proxy + policy/usage APIs. */
export async function registerGatewayRoutes(app: FastifyInstance): Promise<void> {
  // OpenAI-compatible chat completions with policy routing + fallback + metering.
  app.post('/v1/chat/completions', { preHandler: requireAuth }, async (req, reply) => {
    const orgId = req.auth!.orgId;
    const userId = req.auth!.userId;
    const body = (req.body ?? {}) as ChatBody;
    const task = typeof req.headers['x-hub-task'] === 'string' ? (req.headers['x-hub-task'] as string) : undefined;

    // Budget enforcement.
    try {
      await gateway.assertWithinBudget(orgId);
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        return reply.code(429).send({ error: { code: 'budget_exceeded', message: err.message } });
      }
      throw err;
    }

    let result;
    try {
      result = await gateway.forward(orgId, body, task);
    } catch (err) {
      return reply.code(400).send({ error: { code: 'gateway_error', message: err instanceof Error ? err.message : String(err) } });
    }
    const { resp, model, triedModels } = result;

    // Surface which model actually served the request (useful for debugging fallback).
    reply.header('x-hub-model', model);
    reply.header('x-hub-tried', triedModels.join(','));

    if (!resp.ok) {
      const errText = await resp.text();
      let parsed: unknown = errText;
      try { parsed = JSON.parse(errText); } catch { /* keep text */ }
      return reply.code(resp.status).send(parsed);
    }

    // Non-streaming: read JSON, meter precisely, return.
    if (!body.stream) {
      const json = (await resp.json()) as { usage?: { total_tokens?: number } };
      const total = json.usage?.total_tokens ?? 0;
      await gateway.recordUsage(orgId, userId, model, total);
      return reply.send(json);
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
      const total = gateway.parseUsageFromSse(tail);
      void gateway.recordUsage(orgId, userId, model, total, { stream: true });
    });

    Readable.fromWeb(resp.body as never).pipe(meter).pipe(reply.raw);
  });

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
    const tokens = await gateway.monthTokens(req.auth!.orgId);
    const budget = await new PolicyService().budget(req.auth!.orgId);
    return { period: 'month', tokens, budget };
  });
}
