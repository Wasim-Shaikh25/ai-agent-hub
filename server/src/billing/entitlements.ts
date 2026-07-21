import type { FastifyReply, FastifyRequest } from 'fastify';
import { queryOne } from '../db/pool.js';

export type Plan = 'free' | 'team' | 'enterprise';

export type Feature =
  | 'shared_context' | 'semantic_cache' | 'quality_routing' | 'cost_dashboard'
  | 'mcp_aggregation' | 'content_approvals' | 'audit'
  | 'sso' | 'rls' | 'self_host';

export interface Limits {
  seats: number;
  projects: number;
  memoryRows: number;
  monthlyRequests: number;
}

const TEAM: Feature[] = ['shared_context', 'semantic_cache', 'quality_routing', 'cost_dashboard', 'mcp_aggregation', 'content_approvals', 'audit'];
const ENTERPRISE: Feature[] = ['sso', 'rls', 'self_host'];

const INF = Number.POSITIVE_INFINITY;

export const PLANS: Record<Plan, { features: Set<Feature>; limits: Limits }> = {
  free: { features: new Set(), limits: { seats: 1, projects: 2, memoryRows: 500, monthlyRequests: 2000 } },
  team: { features: new Set(TEAM), limits: { seats: 25, projects: INF, memoryRows: 100000, monthlyRequests: 100000 } },
  enterprise: { features: new Set([...TEAM, ...ENTERPRISE]), limits: { seats: INF, projects: INF, memoryRows: INF, monthlyRequests: INF } },
};

export function entitled(plan: Plan, feature: Feature): boolean {
  return PLANS[plan]?.features.has(feature) ?? false;
}

export function limitOf(plan: Plan, key: keyof Limits): number {
  return PLANS[plan]?.limits[key] ?? 0;
}

export function planFeatures(plan: Plan): Feature[] {
  return [...(PLANS[plan]?.features ?? [])];
}

// Small cache so hot paths (gateway, MCP) don't re-query the plan each call.
const cache = new Map<string, { plan: Plan; ts: number }>();
const TTL = 30_000;

/** Resolves an org's plan (cached ~30s). */
export async function getPlan(orgId: string): Promise<Plan> {
  const c = cache.get(orgId);
  if (c && Date.now() - c.ts < TTL) return c.plan;
  const row = await queryOne<{ plan: string }>('SELECT plan FROM org WHERE id = $1', [orgId]);
  const plan = (['free', 'team', 'enterprise'].includes(row?.plan ?? '') ? row!.plan : 'free') as Plan;
  cache.set(orgId, { plan, ts: Date.now() });
  return plan;
}

/** Invalidate the plan cache for an org (call after a plan change). */
export function invalidatePlan(orgId: string): void {
  cache.delete(orgId);
}

/**
 * Fastify preHandler that requires the org's plan to include `feature`,
 * else responds 402 upgrade_required. Runs after requireAuth.
 */
export function requireFeature(feature: Feature) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const plan = await getPlan(req.auth!.orgId);
    if (!entitled(plan, feature)) {
      await reply.code(402).send({
        error: { code: 'upgrade_required', message: `"${feature}" requires a paid plan`, plan, feature },
      });
    }
  };
}
