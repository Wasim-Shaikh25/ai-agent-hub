import http from 'node:http';
import { spawn } from 'node:child_process';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgres://hub:hub@localhost:5432/hub' });

/** Decodes a session JWT's claims ({ orgId, userId, role }). */
export function claims(token) {
  const seg = token.split('.')[1];
  return JSON.parse(Buffer.from(seg.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
}

/** Sets an org's plan directly (bypasses Stripe). Call before the org's first request so no cached plan is stale. */
export async function setPlan(orgId, plan) {
  await pool.query('UPDATE org SET plan = $2 WHERE id = $1', [orgId, plan]);
}

/** Flags a user as a platform super-admin. */
export async function makePlatformAdmin(userId) {
  await pool.query('UPDATE app_user SET is_platform_admin = true WHERE id = $1', [userId]);
}

export async function closeDb() { await pool.end(); }

/** Minimal OpenAI/Anthropic-compatible mock upstream for gateway tests. */
export function startMockLLM(port) {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (req.url.includes('/messages')) {
        res.end(JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 5, output_tokens: 2 } }));
      } else {
        res.end(JSON.stringify({ id: 'c1', choices: [{ message: { role: 'assistant', content: 'ok' } }], usage: { prompt_tokens: 5, completion_tokens: 2 } }));
      }
    });
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

/** Spawns the built server with the given env overrides; resolves when healthy. */
export async function startServer(port, envOverrides = {}) {
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(port),
    DATABASE_URL: process.env.DATABASE_URL || 'postgres://hub:hub@localhost:5432/hub',
    DEV_SEED: 'true',
    DEV_API_KEY: 'hub_test_key',
    JWT_SECRET: 'test-jwt-secret-must-be-at-least-thirty-two-characters-long',
    SUPERADMIN_PASSWORD: 'test-superadmin-password-long',
    EMBEDDINGS_PROVIDER: 'local',
    LOG_LEVEL: 'silent',
    ...envOverrides,
  };
  const proc = spawn('node', ['dist/index.js'], { env, stdio: 'ignore' });
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${base}/health`);
      if (r.ok) return { base, proc, stop: () => stop(proc) };
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  stop(proc);
  throw new Error(`server on ${port} did not become healthy`);
}

function stop(proc) {
  return new Promise((resolve) => {
    if (proc.exitCode !== null) return resolve();
    proc.once('exit', resolve);
    proc.kill('SIGTERM');
    setTimeout(() => { try { proc.kill('SIGKILL'); } catch { /* gone */ } resolve(); }, 3000);
  });
}

/** JSON fetch helper returning { status, body }. */
export async function jfetch(base, path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let parsed;
  try { parsed = await r.json(); } catch { parsed = undefined; }
  return { status: r.status, body: parsed };
}

/** Signs up a fresh org and returns its session token. */
export async function signup(base, prefix = 'u') {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.com`;
  const { body } = await jfetch(base, '/auth/signup', { method: 'POST', body: { email, password: 'pw12345678', org: `${prefix}Co` } });
  return { token: body?.token, email };
}
