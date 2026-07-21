import type { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../auth.js';
import { requireFeature } from '../billing/entitlements.js';
import { query } from '../db/pool.js';
import { KeyService } from '../services/keyService.js';
import { AuditService } from '../services/auditService.js';
import { McpServerStore } from '../services/mcpServerStore.js';

const keys = new KeyService();
const audit = new AuditService();
const mcpServers = new McpServerStore();

/** Admin-only governance endpoints: API keys, audit log, cost breakdown. */
export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  // -- API keys -------------------------------------------------------------
  app.get('/api/keys', { preHandler: [requireAuth, requireRole('admin')] }, async (req) => {
    return keys.list(req.auth!.orgId);
  });

  app.post('/api/keys', { preHandler: [requireAuth, requireRole('admin')] }, async (req) => {
    const b = req.body as { name?: string; role?: string };
    const { raw, record } = await keys.create(req.auth!.orgId, req.auth!.userId, b.name ?? 'key', b.role);
    await audit.log(req.auth!.orgId, req.auth!.userId, 'key.create', record.id, { name: record.name, role: record.role });
    // raw key returned exactly once
    return { key: raw, record };
  });

  app.delete('/api/keys/:id', { preHandler: [requireAuth, requireRole('admin')] }, async (req) => {
    const { id } = req.params as { id: string };
    await keys.revoke(req.auth!.orgId, id);
    await audit.log(req.auth!.orgId, req.auth!.userId, 'key.revoke', id);
    return { ok: true };
  });

  // -- Audit log ------------------------------------------------------------
  app.get('/api/audit', { preHandler: [requireAuth, requireRole('admin'), requireFeature('audit')] }, async (req) => {
    const limit = Number((req.query as { limit?: string }).limit ?? '50');
    return audit.list(req.auth!.orgId, limit);
  });

  // -- Downstream MCP servers (aggregation) ---------------------------------
  app.get('/api/mcp-servers', { preHandler: [requireAuth, requireRole('admin'), requireFeature('mcp_aggregation')] }, async (req) => {
    return mcpServers.list(req.auth!.orgId);
  });

  app.post('/api/mcp-servers', { preHandler: [requireAuth, requireRole('admin'), requireFeature('mcp_aggregation')] }, async (req) => {
    const b = req.body as { name: string; transport?: 'http' | 'stdio'; url?: string; command?: string; args?: string[]; env?: Record<string, string>; enabled?: boolean };
    const row = await mcpServers.create(req.auth!.orgId, b);
    await audit.log(req.auth!.orgId, req.auth!.userId, 'mcp_server.create', row.id, { name: row.name, transport: row.transport });
    return row;
  });

  app.delete('/api/mcp-servers/:id', { preHandler: [requireAuth, requireRole('admin'), requireFeature('mcp_aggregation')] }, async (req) => {
    const { id } = req.params as { id: string };
    await mcpServers.remove(req.auth!.orgId, id);
    await audit.log(req.auth!.orgId, req.auth!.userId, 'mcp_server.delete', id);
    return { ok: true };
  });

  // -- Cost dashboard: usage grouped by model -------------------------------
  app.get('/api/usage/breakdown', { preHandler: [requireAuth, requireRole('member'), requireFeature('cost_dashboard')] }, async (req) => {
    const rows = await query<{ model: string; calls: string; tokens: string; usd: string }>(
      `SELECT meta->>'model' AS model,
              COUNT(*)                         AS calls,
              COALESCE(SUM(qty),0)             AS tokens,
              COALESCE(SUM((meta->>'usd')::numeric),0) AS usd
         FROM usage_event
        WHERE org_id = $1 AND kind = 'tokens'
          AND created_at >= date_trunc('month', now())
        GROUP BY meta->>'model'
        ORDER BY usd DESC`,
      [req.auth!.orgId],
    );
    return {
      period: 'month',
      byModel: rows.map((r) => ({ model: r.model, calls: Number(r.calls), tokens: Number(r.tokens), usd: Number(Number(r.usd).toFixed(6)) })),
    };
  });
}
