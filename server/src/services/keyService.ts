import { createHash, randomBytes } from 'node:crypto';
import { query, queryOne } from '../db/pool.js';

export interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  role: string | null;
  revoked: boolean;
  last_used_at: string | null;
  created_at: string;
}

/** Manages API keys for an org. Raw keys are shown once, only hashes stored. */
export class KeyService {
  /**
   * Mints a new API key. Returns the raw key exactly once — it is never
   * recoverable afterwards (only its sha256 hash is stored).
   */
  async create(orgId: string, userId: string, name: string, role?: string): Promise<{ raw: string; record: ApiKeyRecord }> {
    const raw = `hub_${randomBytes(24).toString('hex')}`;
    const hash = createHash('sha256').update(raw).digest('hex');
    const prefix = raw.slice(0, 12);
    const record = await queryOne<ApiKeyRecord>(
      `INSERT INTO api_key (org_id, user_id, name, hash, prefix, role)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, name, prefix, role, revoked, last_used_at, created_at`,
      [orgId, userId, name, hash, prefix, role ?? null],
    );
    return { raw, record: record! };
  }

  list(orgId: string): Promise<ApiKeyRecord[]> {
    return query<ApiKeyRecord>(
      `SELECT id, name, prefix, role, revoked, last_used_at, created_at
         FROM api_key WHERE org_id = $1 ORDER BY created_at DESC`,
      [orgId],
    );
  }

  async revoke(orgId: string, id: string): Promise<void> {
    await query('UPDATE api_key SET revoked = true WHERE org_id = $1 AND id = $2', [orgId, id]);
  }
}
