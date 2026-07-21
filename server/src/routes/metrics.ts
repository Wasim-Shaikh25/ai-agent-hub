import type { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../auth.js';
import { requireFeature } from '../billing/entitlements.js';
import { query, queryOne } from '../db/pool.js';

const MONTH = `created_at >= date_trunc('month', now())`;

/** Analytics over the usage_event stream (feeds the dashboard). */
export async function registerMetricsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/metrics/summary', { preHandler: [requireAuth, requireRole('member'), requireFeature('cost_dashboard')] }, async (req) => {
    const row = await queryOne<Record<string, string>>(
      `SELECT
         COUNT(*)                                             AS requests,
         COALESCE(SUM(qty),0)                                 AS tokens,
         COALESCE(SUM((meta->>'usd')::numeric),0)             AS usd,
         COUNT(*) FILTER (WHERE meta->>'cached' = 'true')     AS cache_hits,
         COALESCE(AVG((meta->>'latency_ms')::numeric)
                  FILTER (WHERE meta ? 'latency_ms' AND meta->>'cached' IS DISTINCT FROM 'true'),0) AS avg_latency_ms
       FROM usage_event WHERE org_id = $1 AND kind='tokens' AND ${MONTH}`,
      [req.auth!.orgId],
    );
    const requests = Number(row?.requests ?? 0);
    const cacheHits = Number(row?.cache_hits ?? 0);
    return {
      period: 'month',
      requests,
      tokens: Number(row?.tokens ?? 0),
      usd: Number(Number(row?.usd ?? 0).toFixed(6)),
      cacheHits,
      cacheHitRate: requests ? Number((cacheHits / requests).toFixed(3)) : 0,
      avgLatencyMs: Math.round(Number(row?.avg_latency_ms ?? 0)),
    };
  });

  app.get('/api/metrics/by-model', { preHandler: [requireAuth, requireRole('member'), requireFeature('cost_dashboard')] }, async (req) => {
    return query(
      `SELECT meta->>'model' AS model, COUNT(*) AS calls, COALESCE(SUM(qty),0) AS tokens,
              COALESCE(SUM((meta->>'usd')::numeric),0) AS usd
         FROM usage_event WHERE org_id=$1 AND kind='tokens' AND ${MONTH}
        GROUP BY meta->>'model' ORDER BY usd DESC`,
      [req.auth!.orgId],
    );
  });

  app.get('/api/metrics/by-user', { preHandler: [requireAuth, requireRole('admin'), requireFeature('cost_dashboard')] }, async (req) => {
    return query(
      `SELECT COALESCE(u.email,'(unknown)') AS user, COUNT(*) AS calls,
              COALESCE(SUM(e.qty),0) AS tokens, COALESCE(SUM((e.meta->>'usd')::numeric),0) AS usd
         FROM usage_event e LEFT JOIN app_user u ON u.id = e.user_id
        WHERE e.org_id=$1 AND e.kind='tokens' AND e.${MONTH}
        GROUP BY u.email ORDER BY usd DESC`,
      [req.auth!.orgId],
    );
  });

  app.get('/api/metrics/timeseries', { preHandler: [requireAuth, requireRole('member'), requireFeature('cost_dashboard')] }, async (req) => {
    const days = Math.min(Math.max(Number((req.query as { days?: string }).days ?? '30'), 1), 365);
    return query(
      `SELECT to_char(date_trunc('day', created_at),'YYYY-MM-DD') AS day,
              COALESCE(SUM(qty),0) AS tokens, COALESCE(SUM((meta->>'usd')::numeric),0) AS usd
         FROM usage_event WHERE org_id=$1 AND kind='tokens'
           AND created_at >= now() - ($2 || ' days')::interval
        GROUP BY 1 ORDER BY 1`,
      [req.auth!.orgId, String(days)],
    );
  });

  app.get('/api/metrics/savings', { preHandler: [requireAuth, requireRole('member'), requireFeature('cost_dashboard')] }, async (req) => {
    const row = await queryOne<Record<string, string>>(
      `SELECT COUNT(*) FILTER (WHERE meta->>'cached'='true') AS cache_hits,
              COALESCE(SUM((meta->>'saved_tokens')::numeric),0) AS saved_tokens,
              COALESCE(SUM((meta->>'saved_usd')::numeric),0) AS saved_usd
         FROM usage_event WHERE org_id=$1 AND kind='tokens' AND ${MONTH}`,
      [req.auth!.orgId],
    );
    return {
      cacheHits: Number(row?.cache_hits ?? 0),
      savedTokens: Number(row?.saved_tokens ?? 0),
      savedUsd: Number(Number(row?.saved_usd ?? 0).toFixed(6)),
    };
  });
}
