import { query, queryOne } from '../db/pool.js';
import { redact } from '../privacy/redact.js';

export type Level = 'error' | 'warn' | 'info';

export interface SystemEvent {
  id: string;
  org_id: string | null;
  level: Level;
  source: string;
  code: string;
  message: string;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface EventSummary {
  windowHours: number;
  total: number;
  byLevel: Record<string, number>;
  byCode: Array<{ code: string; level: string; n: number; last: string }>;
  bySource: Array<{ source: string; n: number }>;
  topOrgs: Array<{ org_id: string | null; name: string | null; n: number }>;
}

/**
 * Structured operational-event log. Records are best-effort — recording never
 * throws into the request path — and messages are redacted before storage.
 */
export class EventService {
  /** Record an operational event. Fire-and-forget safe (never rejects). */
  async record(level: Level, source: string, code: string, message: string, orgId: string | null = null, meta: Record<string, unknown> = {}): Promise<void> {
    try {
      await query(
        `INSERT INTO system_event (org_id, level, source, code, message, meta) VALUES ($1,$2,$3,$4,$5,$6)`,
        [orgId, level, source, code, redact(message).text.slice(0, 2000), JSON.stringify(meta)],
      );
    } catch {
      /* logging must never break the request it describes */
    }
  }

  /** Recent events, newest first, with optional level/source/code filters. */
  list(filter: { level?: string; source?: string; code?: string; orgId?: string; limit?: number } = {}): Promise<SystemEvent[]> {
    const where: string[] = [];
    const vals: unknown[] = [];
    for (const [col, val] of [['level', filter.level], ['source', filter.source], ['code', filter.code], ['org_id', filter.orgId]] as const) {
      if (val) { vals.push(val); where.push(`${col} = $${vals.length}`); }
    }
    vals.push(Math.min(Math.max(filter.limit ?? 100, 1), 500));
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return query<SystemEvent>(`SELECT * FROM system_event ${clause} ORDER BY created_at DESC LIMIT $${vals.length}`, vals);
  }

  /** Aggregated issue picture over the last `windowHours` (default 24h). */
  async summary(windowHours = 24): Promise<EventSummary> {
    const since = `now() - interval '${Math.min(Math.max(windowHours, 1), 720)} hours'`;
    const [levels, codes, sources, orgs, total] = await Promise.all([
      query<{ level: string; n: string }>(`SELECT level, COUNT(*) AS n FROM system_event WHERE created_at >= ${since} GROUP BY level`),
      query<{ code: string; level: string; n: string; last: string }>(
        `SELECT code, MAX(level) AS level, COUNT(*) AS n, MAX(created_at) AS last FROM system_event WHERE created_at >= ${since} GROUP BY code ORDER BY 3 DESC LIMIT 20`),
      query<{ source: string; n: string }>(`SELECT source, COUNT(*) AS n FROM system_event WHERE created_at >= ${since} GROUP BY source ORDER BY 2 DESC`),
      query<{ org_id: string | null; name: string | null; n: string }>(
        `SELECT e.org_id, o.name, COUNT(*) AS n FROM system_event e LEFT JOIN org o ON o.id = e.org_id
           WHERE e.created_at >= ${since} AND e.level = 'error' GROUP BY e.org_id, o.name ORDER BY 3 DESC LIMIT 10`),
      queryOne<{ n: string }>(`SELECT COUNT(*) AS n FROM system_event WHERE created_at >= ${since}`),
    ]);
    const byLevel: Record<string, number> = {};
    for (const l of levels) byLevel[l.level] = Number(l.n);
    return {
      windowHours,
      total: Number(total?.n ?? 0),
      byLevel,
      byCode: codes.map((c) => ({ code: c.code, level: c.level, n: Number(c.n), last: c.last })),
      bySource: sources.map((s) => ({ source: s.source, n: Number(s.n) })),
      topOrgs: orgs.map((o) => ({ org_id: o.org_id, name: o.name, n: Number(o.n) })),
    };
  }
}

export const events = new EventService();
