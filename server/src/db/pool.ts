import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';
import { config } from '../config.js';

/** Shared Postgres connection pool. */
export const pool = new pg.Pool({ connectionString: config.databaseUrl });

// Per-request org context. When set (and RLS_ENABLED=true), queries run with the
// `app.current_org` GUC so the Row-Level Security policies (migration 005)
// enforce tenant isolation at the database layer — defense-in-depth behind the
// app's own org_id-scoped queries.
const orgStore = new AsyncLocalStorage<string | undefined>();

/** Binds the current async context to an org (used by auth/MCP entry points). */
export function setOrgContext(orgId: string): void {
  orgStore.enterWith(orgId);
}

/** Runs `fn` with an explicit org context (for code paths outside a request). */
export function runWithOrg<T>(orgId: string, fn: () => T): T {
  return orgStore.run(orgId, fn);
}

/**
 * Clears the org context so subsequent queries run unrestricted (permissive via
 * the RLS IS NULL escape). Used by platform super-admin routes that legitimately
 * read across every org.
 */
export function clearOrgContext(): void {
  orgStore.enterWith(undefined);
}

/**
 * Executes a query. When an org context is bound and RLS is enabled, it runs in
 * a short transaction with `app.current_org` set (SET LOCAL, auto-reset on
 * commit) so RLS enforces isolation on that connection. Otherwise it uses the
 * pool directly (the RLS policy's IS NULL escape keeps these permissive — needed
 * for auth bootstrap and background jobs).
 */
async function exec<T extends pg.QueryResultRow>(text: string, params: unknown[]): Promise<pg.QueryResult<T>> {
  const orgId = config.rlsEnabled ? orgStore.getStore() : undefined;
  if (!orgId) return pool.query<T>(text, params as never[]);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_org', $1, true)", [orgId]);
    const res = await client.query<T>(text, params as never[]);
    await client.query('COMMIT');
    return res;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* connection already broken */ }
    throw err;
  } finally {
    client.release();
  }
}

/** Typed query helper returning rows. */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await exec<T>(text, params);
  return res.rows;
}

/** Query helper returning the first row or undefined. */
export async function queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  const rows = await query<T>(text, params);
  return rows[0];
}
