import type { FastifyReply, FastifyRequest } from 'fastify';
import { queryOne } from '../db/pool.js';

export type Plan = 'free' | 'paid';

export type Feature =
  | 'shared_context' | 'semantic_cache' | 'quality_routing' | 'cost_dashboard'
  | 'mcp_aggregation' | 'content_approvals' | 'audit';

export interface Limits {
  seats: number;
  projects: number;
  memoryRows: number;
  monthlyRequests: number;
}

const PAID: Feature[] = ['shared_context', 'semantic_cache', 'quality_routing', 'cost_dashboard', 'mcp_aggregation', 'content_approvals', 'audit'];

const INF = Number.POSITIVE_INFINITY;

export const PLANS: Record<Plan, { features: Set<Feature>; limits: Limits }> = {
  free: { features: new Set(), limits: { seats: 1, projects: 2, memoryRows: 500, monthlyRequests: 2000 } },
  paid: { features: new Set(PAID), limits: { seats: 25, projects: INF, memoryRows: 100000, monthlyRequests: 100000 } },
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
const cache = new Map<string, { plan: Plan; suspended: boolean; ts: number }>();
const TTL = 30_000;

async function orgState(orgId: string): Promise<{ plan: Plan; suspended: boolean }> {
  const c = cache.get(orgId);
  if (c && Date.now() - c.ts < TTL) return c;
  const row = await queryOne<{ plan: string; suspended: boolean }>('SELECT plan, suspended FROM org WHERE id = $1', [orgId]);
  const plan = (['free', 'paid'].includes(row?.plan ?? '') ? row!.plan : 'free') as Plan;
  const state = { plan, suspended: Boolean(row?.suspended), ts: Date.now() };
  cache.set(orgId, state);
  return state;
}

/** Resolves an org's plan (cached ~30s). */
export async function getPlan(orgId: string): Promise<Plan> {
  return (await orgState(orgId)).plan;
}

/** True if the org is suspended (cached ~30s). */
export async function isSuspended(orgId: string): Promise<boolean> {
  return (await orgState(orgId)).suspended;
}

/** Invalidate the cache for an org (call after a plan/suspend change). */
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
