import { query } from '../db/pool.js';

export interface AuditEntry {
  id: string;
  user_id: string | null;
  action: string;
  target: string;
  meta: Record<string, unknown>;
  created_at: string;
}

/** Append-only audit log of governance-relevant actions. */
export class AuditService {
  /** Records an audit entry (best-effort; never throws into the caller). */
  async log(orgId: string, userId: string | null, action: string, target = '', meta: Record<string, unknown> = {}): Promise<void> {
    try {
      await query(
        'INSERT INTO audit_log (org_id, user_id, action, target, meta) VALUES ($1,$2,$3,$4,$5)',
        [orgId, userId, action, target, JSON.stringify(meta)],
      );
    } catch {
      // audit must not break the request path
    }
  }

  list(orgId: string, limit = 50): Promise<AuditEntry[]> {
    return query<AuditEntry>(
      'SELECT id, user_id, action, target, meta, created_at FROM audit_log WHERE org_id = $1 ORDER BY created_at DESC LIMIT $2',
      [orgId, Math.min(Math.max(limit, 1), 500)],
    );
  }
}
