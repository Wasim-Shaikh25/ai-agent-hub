import type { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../auth.js';
import { config } from '../config.js';
import { PrivacyService } from '../services/privacyService.js';
import { AuditService } from '../services/auditService.js';

const privacy = new PrivacyService();
const audit = new AuditService();

/** Data-residency & privacy endpoints (admin). */
export async function registerPrivacyRoutes(app: FastifyInstance): Promise<void> {
  // Where data lives + what protections are on — answers the residency question.
  app.get('/api/privacy/config', { preHandler: [requireAuth, requireRole('admin')] }, async () => {
    return {
      storageMode: config.storageMode, // "central" = this server; "local" = per-dev
      logPrompts: config.logPrompts,
      redaction: { enabled: config.redactionEnabled, mode: config.redactionMode },
      note: config.storageMode === 'central'
        ? 'Context is stored on this Hub server (your infra); never on developer machines or in the LLM provider.'
        : 'Local mode: context stays on each developer machine; nothing is centralized.',
    };
  });

  // Right-to-be-forgotten: purge a project's or a user's data.
  app.post('/api/privacy/purge', { preHandler: [requireAuth, requireRole('admin')] }, async (req) => {
    const b = req.body as { project?: string; userId?: string };
    const result: Record<string, unknown> = {};
    if (b.project) result.project = await privacy.purgeProject(req.auth!.orgId, b.project);
    if (b.userId) result.user = await privacy.purgeUser(req.auth!.orgId, b.userId);
    await audit.log(req.auth!.orgId, req.auth!.userId, 'privacy.purge', b.project ?? b.userId ?? '', result);
    return { ok: true, ...result };
  });

  // Retention sweep: delete context + usage older than N days.
  app.post('/api/privacy/retention', { preHandler: [requireAuth, requireRole('admin')] }, async (req) => {
    const days = Number((req.body as { days?: number }).days ?? config.cacheTtlDays);
    const counts = await privacy.runRetention(req.auth!.orgId, days);
    await audit.log(req.auth!.orgId, req.auth!.userId, 'privacy.retention', String(days), { ...counts });
    return { ok: true, days, deleted: counts };
  });
}
