import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { config } from '../config.js';
import { pool, query, queryOne } from './pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations');

/** Applies all .sql files in migrations/ in filename order (idempotent). */
export async function migrate(): Promise<void> {
  await query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const done = await queryOne('SELECT name FROM schema_migrations WHERE name = $1', [file]);
    if (done) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
    await pool.query(sql);
    await query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    console.log(`[migrate] applied ${file}`);
  }
}

/** Seeds a dev org + user + API key on first boot (idempotent). */
export async function seedDev(): Promise<void> {
  if (!config.devSeed) return;

  const existing = await queryOne<{ id: string }>('SELECT id FROM org LIMIT 1');
  if (existing) return;

  const org = await queryOne<{ id: string }>(
    `INSERT INTO org (name, slug, plan) VALUES ($1,$2,$3) RETURNING id`,
    ['Dev Org', 'dev', 'enterprise'],
  );
  const user = await queryOne<{ id: string }>(
    `INSERT INTO app_user (email, name) VALUES ($1,$2) RETURNING id`,
    ['dev@localhost', 'Dev User'],
  );
  await query('INSERT INTO membership (org_id, user_id, role) VALUES ($1,$2,$3)', [
    org!.id,
    user!.id,
    'owner',
  ]);

  const rawKey = config.devApiKey;
  const hash = createHash('sha256').update(rawKey).digest('hex');
  await query(
    `INSERT INTO api_key (org_id, user_id, name, hash, prefix) VALUES ($1,$2,$3,$4,$5)`,
    [org!.id, user!.id, 'dev', hash, rawKey.slice(0, 8)],
  );

  // A default project so smoke tests work out of the box.
  await query('INSERT INTO project (org_id, name, repo_path) VALUES ($1,$2,$3)', [
    org!.id,
    'default',
    '',
  ]);

  console.log('');
  console.log('  ┌───────────────────────────────────────────────┐');
  console.log('  │  Dev seed complete.                            │');
  console.log(`  │  DEV_API_KEY = ${rawKey.padEnd(32)}│`);
  console.log('  └───────────────────────────────────────────────┘');
  console.log('');
}

// Allow `npm run migrate` to run this file directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate()
    .then(() => seedDev())
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[migrate] failed:', err);
      process.exit(1);
    });
}
