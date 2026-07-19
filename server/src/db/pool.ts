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
