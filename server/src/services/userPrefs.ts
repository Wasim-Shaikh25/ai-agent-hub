import { query, queryOne } from '../db/pool.js';

// Short cache so the gateway hot path doesn't re-query the preference each call.
const cache = new Map<string, { model: string | undefined; ts: number }>();
const TTL = 15_000;

function keyOf(orgId: string, userId: string): string {
  return `${orgId}:${userId}`;
}

/** The user's chosen model, or undefined if they haven't picked one. */
export async function getUserModel(orgId: string, userId: string): Promise<string | undefined> {
  const k = keyOf(orgId, userId);
  const c = cache.get(k);
  if (c && Date.now() - c.ts < TTL) return c.model;
  const row = await queryOne<{ model: string }>('SELECT model FROM user_model_pref WHERE org_id = $1 AND user_id = $2', [orgId, userId]);
  const model = row?.model;
  cache.set(k, { model, ts: Date.now() });
  return model;
}

/** Sets (or clears, when model is empty) the user's model choice. */
export async function setUserModel(orgId: string, userId: string, model: string | null): Promise<void> {
  if (!model) {
    await query('DELETE FROM user_model_pref WHERE org_id = $1 AND user_id = $2', [orgId, userId]);
  } else {
    await query(
      `INSERT INTO user_model_pref (org_id, user_id, model) VALUES ($1,$2,$3)
       ON CONFLICT (org_id, user_id) DO UPDATE SET model = EXCLUDED.model, updated_at = now()`,
      [orgId, userId, model],
    );
  }
  cache.set(keyOf(orgId, userId), { model: model ?? undefined, ts: Date.now() });
}
