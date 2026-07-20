import { query, queryOne } from '../db/pool.js';

export interface PurgeCounts {
  memory: number;
  documents: number;
  sessions: number;
  usage: number;
}

/** Data-residency operations: purge (right-to-be-forgotten) and retention. */
export class PrivacyService {
  /** Deletes all context for a project (memory, docs+chunks, sessions+turns). */
  async purgeProject(orgId: string, projectName: string): Promise<PurgeCounts> {
    const proj = await queryOne<{ id: string }>('SELECT id FROM project WHERE org_id = $1 AND name = $2', [orgId, projectName]);
    if (!proj) return { memory: 0, documents: 0, sessions: 0, usage: 0 };

    const mem = await query('DELETE FROM memory WHERE org_id = $1 AND project_id = $2 RETURNING 1', [orgId, proj.id]);
    const docs = await query('DELETE FROM document WHERE org_id = $1 AND project_id = $2 RETURNING 1', [orgId, proj.id]); // chunks cascade
    const sess = await query('DELETE FROM session WHERE org_id = $1 AND project_id = $2 RETURNING 1', [orgId, proj.id]); // turns cascade

    return { memory: mem.length, documents: docs.length, sessions: sess.length, usage: 0 };
  }

  /** Deletes a user's usage records (e.g. an offboarded developer). */
  async purgeUser(orgId: string, userId: string): Promise<{ usage: number }> {
    const rows = await query('DELETE FROM usage_event WHERE org_id = $1 AND user_id = $2 RETURNING 1', [orgId, userId]);
    return { usage: rows.length };
  }

  /** Deletes context + usage older than `days` for an org (retention sweep). */
  async runRetention(orgId: string, days: number): Promise<PurgeCounts> {
    const cutoff = `now() - interval '${Math.max(1, Math.floor(days))} days'`;
    const mem = await query(`DELETE FROM memory WHERE org_id = $1 AND created_at < ${cutoff} RETURNING 1`, [orgId]);
    const usage = await query(`DELETE FROM usage_event WHERE org_id = $1 AND created_at < ${cutoff} RETURNING 1`, [orgId]);
    const turns = await query(
      `DELETE FROM turn t USING session s WHERE t.session_id = s.id AND s.org_id = $1 AND t.created_at < ${cutoff} RETURNING 1`,
      [orgId],
    );
    return { memory: mem.length, documents: 0, sessions: turns.length, usage: usage.length };
  }
}
