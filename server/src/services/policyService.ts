import { query, queryOne } from '../db/pool.js';

export type PolicyKind = 'routing' | 'model' | 'budget' | 'content';

export interface Policy {
  id: string;
  org_id: string;
  kind: PolicyKind;
  spec: Record<string, unknown>;
  enabled: boolean;
}

/**
 * CRUD + typed reads for governance policies.
 *
 * Spec conventions:
 * - routing: `{ task: string, model: string }`     (one row per task)
 * - model:   `{ model: string, fallbacks: string[] }` per primary, and/or
 *            `{ default_chain: string[] }` as the org-wide default chain
 * - budget:  `{ period: "month", maxTokens?: number, maxUsd?: number }`
 */
export class PolicyService {
  list(orgId: string, kind?: PolicyKind): Promise<Policy[]> {
    if (kind) {
      return query<Policy>('SELECT * FROM policy WHERE org_id = $1 AND kind = $2', [orgId, kind]);
    }
    return query<Policy>('SELECT * FROM policy WHERE org_id = $1', [orgId]);
  }

  async create(orgId: string, kind: PolicyKind, spec: Record<string, unknown>, enabled = true): Promise<Policy> {
    const row = await queryOne<Policy>(
      'INSERT INTO policy (org_id, kind, spec, enabled) VALUES ($1,$2,$3,$4) RETURNING *',
      [orgId, kind, JSON.stringify(spec), enabled],
    );
    return row!;
  }

  async remove(orgId: string, id: string): Promise<void> {
    await query('DELETE FROM policy WHERE org_id = $1 AND id = $2', [orgId, id]);
  }

  /** The model configured for a given task, if any routing policy matches. */
  async modelForTask(orgId: string, task: string | undefined): Promise<string | undefined> {
    if (!task) return undefined;
    const rows = await this.list(orgId, 'routing');
    for (const p of rows) {
      if (p.enabled && p.spec['task'] === task) return String(p.spec['model']);
    }
    return undefined;
  }

  /** Fallback list for a primary model + the org default chain. */
  async fallbacksFor(orgId: string, model: string): Promise<{ fallbacks: string[]; defaultChain: string[] }> {
    const rows = await this.list(orgId, 'model');
    let fallbacks: string[] = [];
    let defaultChain: string[] = [];
    for (const p of rows) {
      if (!p.enabled) continue;
      if (p.spec['model'] === model && Array.isArray(p.spec['fallbacks'])) {
        fallbacks = (p.spec['fallbacks'] as unknown[]).map(String);
      }
      if (Array.isArray(p.spec['default_chain'])) {
        defaultChain = (p.spec['default_chain'] as unknown[]).map(String);
      }
    }
    return { fallbacks, defaultChain };
  }

  /** The active budget policy spec, if any. */
  async budget(orgId: string): Promise<{ maxTokens?: number; maxUsd?: number } | undefined> {
    const rows = await this.list(orgId, 'budget');
    const active = rows.find((p) => p.enabled);
    if (!active) return undefined;
    return {
      maxTokens: active.spec['maxTokens'] != null ? Number(active.spec['maxTokens']) : undefined,
      maxUsd: active.spec['maxUsd'] != null ? Number(active.spec['maxUsd']) : undefined,
    };
  }
}
