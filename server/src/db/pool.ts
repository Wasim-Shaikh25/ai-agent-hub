import pg from 'pg';
import { config } from '../config.js';

/** Shared Postgres connection pool. */
export const pool = new pg.Pool({ connectionString: config.databaseUrl });

/** Typed query helper returning rows. */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool.query<T>(text, params as never[]);
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

/**
 * Runs `fn` inside a transaction with the `app.current_org` GUC set, so
 * Row-Level Security policies (migration 005) enforce tenant isolation at the
 * database layer. Use this to opt a code path into DB-enforced isolation.
 */
export async function withOrg<T>(orgId: string, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_org', $1, true)", [orgId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
