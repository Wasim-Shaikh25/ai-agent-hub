import type { FastifyInstance } from 'fastify';
import { requireAuth, requireSuperadmin } from '../auth.js';
import { query, queryOne } from '../db/pool.js';
import { invalidatePlan, type Plan } from '../billing/entitlements.js';
import { training } from '../services/trainingService.js';
import { events } from '../services/eventService.js';
import { assistantReply, type PlatformSnapshot } from '../services/assistant.js';
import { AuditService } from '../services/auditService.js';

const audit = new AuditService();
const PLANS: Plan[] = ['free', 'team', 'enterprise'];

/** Gathers a platform-wide snapshot for the copilot + overview tab. */
async function snapshot(): Promise<PlatformSnapshot> {
  const orgs = await queryOne<{ n: string; suspended: string }>(
    'SELECT COUNT(*) AS n, COUNT(*) FILTER (WHERE suspended) AS suspended FROM org',
  );
  const byPlanRows = await query<{ plan: string; n: string }>('SELECT plan, COUNT(*) AS n FROM org GROUP BY plan');
  const usage = await queryOne<{ tokens: string; usd: string }>(
    `SELECT COALESCE(SUM(qty),0) AS tokens, COALESCE(SUM((meta->>'usd')::numeric),0) AS usd
       FROM usage_event WHERE kind = 'tokens' AND created_at >= date_trunc('month', now())`,
  );
  const byPlan: Record<string, number> = {};
  for (const r of byPlanRows) byPlan[r.plan] = Number(r.n);
  const iss = await events.summary(24);
  return {
    orgs: Number(orgs?.n ?? 0),
    suspended: Number(orgs?.suspended ?? 0),
    byPlan,
    monthTokens: Number(usage?.tokens ?? 0),
    monthUsd: Number(usage?.usd ?? 0),
    issues: {
      windowHours: iss.windowHours,
      total: iss.total,
      byLevel: iss.byLevel,
      byCode: iss.byCode.map((c) => ({ code: c.code, level: c.level, n: c.n })),
      topOrgs: iss.topOrgs.map((o) => ({ name: o.name, n: o.n })),
    },
  };
}

/**
 * Platform super-admin plane: cross-org control, training data, and the
 * operator copilot. Every route is gated by {@link requireSuperadmin}.
 */
export async function registerPlatformRoutes(app: FastifyInstance): Promise<void> {
  const guard = { preHandler: [requireAuth, requireSuperadmin] };

  // -- overview -------------------------------------------------------------
  app.get('/api/platform/stats', guard, async () => snapshot());

  // -- orgs: list + control -------------------------------------------------
  app.get('/api/platform/orgs', guard, async () => {
    return query(
      `SELECT o.id, o.name, o.slug, o.plan, o.suspended, o.created_at,
              (SELECT COUNT(*) FROM membership m WHERE m.org_id = o.id) AS seats,
              (SELECT COALESCE(SUM(qty),0) FROM usage_event u
                 WHERE u.org_id = o.id AND u.kind = 'tokens'
                   AND u.created_at >= date_trunc('month', now())) AS month_tokens
         FROM org o ORDER BY o.created_at DESC`,
    );
  });

  app.put('/api/platform/orgs/:id', guard, async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = req.body as { plan?: string; suspended?: boolean };
    const sets: string[] = [];
    const vals: unknown[] = [id];
    if (b.plan !== undefined) {
      if (!PLANS.includes(b.plan as Plan)) {
        return reply.code(400).send({ error: { code: 'bad_request', message: 'plan must be free|team|enterprise' } });
      }
      vals.push(b.plan);
      sets.push(`plan = $${vals.length}`);
    }
    if (b.suspended !== undefined) {
      vals.push(Boolean(b.suspended));
      sets.push(`suspended = $${vals.length}`);
    }
    if (!sets.length) return reply.code(400).send({ error: { code: 'bad_request', message: 'nothing to update' } });

    const row = await queryOne(`UPDATE org SET ${sets.join(', ')} WHERE id = $1 RETURNING id, name, plan, suspended`, vals);
    if (!row) return reply.code(404).send({ error: { code: 'not_found', message: 'org not found' } });
    invalidatePlan(id);
    await audit.log(req.auth!.orgId, req.auth!.userId, 'platform.org_update', id, { plan: b.plan, suspended: b.suspended });
    return row;
  });

  // -- issue analysis (operational event log) -------------------------------
  app.get('/api/platform/events/summary', guard, async (req) => {
    const hours = Number((req.query as { hours?: string }).hours ?? '24');
    return events.summary(hours);
  });

  app.get('/api/platform/events', guard, async (req) => {
    const q = req.query as { level?: string; source?: string; code?: string; orgId?: string; limit?: string };
    return events.list({ level: q.level, source: q.source, code: q.code, orgId: q.orgId, limit: Number(q.limit ?? '100') });
  });

  // -- feedback labels (👍/👎 from users) -----------------------------------
  app.get('/api/platform/training', guard, async (req) => {
    const q = req.query as { kind?: string; limit?: string };
    const [samples, stats] = await Promise.all([training.list(q.kind, Number(q.limit ?? '50')), training.stats()]);
    return { stats, samples };
  });

  // -- operator copilot -----------------------------------------------------
  app.post('/api/platform/assistant', guard, async (req, reply) => {
    const message = (req.body as { message?: string }).message?.trim();
    if (!message) return reply.code(400).send({ error: { code: 'bad_request', message: 'message required' } });
    const result = await assistantReply(message, await snapshot());
    // Capture the exchange as training data (redacted at rest).
    void training.record('assistant', req.auth!.orgId, message, result.reply, { llm: result.llm });
    return result;
  });
}

/**
 * User-facing feedback endpoint (any authenticated caller). Ratings feed the
 * training pipeline so admins can curate good/bad completions.
 */
export async function registerFeedbackRoute(app: FastifyInstance): Promise<void> {
  app.post('/api/feedback', { preHandler: requireAuth }, async (req, reply) => {
    const b = req.body as { input?: string; output?: string; rating?: number; meta?: Record<string, unknown> };
    const rating = b.rating === 1 || b.rating === -1 ? b.rating : null;
    if (!b.output) return reply.code(400).send({ error: { code: 'bad_request', message: 'output required' } });
    await training.record('feedback', req.auth!.orgId, b.input ?? '', b.output, b.meta ?? {}, rating);
    return { ok: true };
  });
}
