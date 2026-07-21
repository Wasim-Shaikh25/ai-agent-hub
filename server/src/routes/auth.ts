import type { FastifyInstance } from 'fastify';
import { queryOne, query } from '../db/pool.js';
import { getSsoProvider } from '../auth/sso.js';
import { signSession } from '../auth/jwt.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { getPlan, entitled } from '../billing/entitlements.js';
import { KeyService } from '../services/keyService.js';
import { AuditService } from '../services/auditService.js';

const audit = new AuditService();
const keys = new KeyService();

function slugify(s: string): string {
  return (s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'org').slice(0, 32);
}

/** Encodes/decodes the org slug in the OAuth `state` parameter. */
function encodeState(orgSlug: string): string {
  return Buffer.from(JSON.stringify({ org: orgSlug, n: Math.random().toString(36).slice(2) })).toString('base64url');
}
function decodeState(state: string): { org: string } {
  try {
    return JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
  } catch {
    return { org: 'dev' };
  }
}

/** SSO login + callback. `dev` provider works offline; `workos` is the real IdP. */
export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  // Kick off SSO. `org` selects the tenant; `email` is only used by the dev provider.
  app.get('/auth/sso/login', async (req, reply) => {
    const q = req.query as { org?: string; email?: string };
    const orgSlug = q.org ?? 'dev';
    const url = getSsoProvider().authorizeUrl(encodeState(orgSlug), { email: q.email });
    return reply.redirect(url);
  });

  // IdP redirects here with a code; we exchange it, provision the user, issue a JWT.
  app.get('/auth/sso/callback', async (req, reply) => {
    const q = req.query as { code?: string; state?: string };
    if (!q.code) return reply.code(400).send({ error: { code: 'bad_request', message: 'missing code' } });

    const { org: orgSlug } = decodeState(q.state ?? '');
    const org = await queryOne<{ id: string }>('SELECT id FROM org WHERE slug = $1', [orgSlug]);
    if (!org) return reply.code(404).send({ error: { code: 'not_found', message: `org "${orgSlug}" not found` } });

    // SSO is an Enterprise feature.
    if (!entitled(await getPlan(org.id), 'sso')) {
      return reply.code(402).send({ error: { code: 'upgrade_required', message: 'SSO requires the Enterprise plan', feature: 'sso' } });
    }

    let profile;
    try {
      profile = await getSsoProvider().exchangeCode(q.code);
    } catch (err) {
      return reply.code(401).send({ error: { code: 'sso_failed', message: err instanceof Error ? err.message : String(err) } });
    }
    if (!profile.email) return reply.code(401).send({ error: { code: 'sso_failed', message: 'no email in profile' } });

    // Provision user + membership (JIT).
    const user = await queryOne<{ id: string }>(
      `INSERT INTO app_user (email, name) VALUES ($1,$2)
       ON CONFLICT (email) DO UPDATE SET name = COALESCE(NULLIF(EXCLUDED.name,''), app_user.name)
       RETURNING id`,
      [profile.email, profile.name],
    );
    const membership = await queryOne<{ role: string }>(
      `INSERT INTO membership (org_id, user_id, role) VALUES ($1,$2,'member')
       ON CONFLICT (org_id, user_id) DO UPDATE SET role = membership.role
       RETURNING role`,
      [org.id, user!.id],
    );

    const token = signSession({ orgId: org.id, userId: user!.id, role: membership!.role, email: profile.email });
    await audit.log(org.id, user!.id, 'auth.sso_login', profile.email, { provider: getSsoProvider().name });

    // Return the token (a real web UI would set a cookie / redirect to the app).
    return reply.send({ token, org: org.id, email: profile.email, role: membership!.role });
  });

  // Convenience: list SSO config status (no secrets).
  app.get('/auth/sso/info', async () => {
    return { provider: getSsoProvider().name, loginUrl: '/auth/sso/login?org=<slug>' };
  });

  // -- Email/password signup + login (customer web app) ---------------------

  app.post('/auth/signup', async (req, reply) => {
    const b = req.body as { email?: string; password?: string; orgName?: string };
    const email = (b.email ?? '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply.code(400).send({ error: { code: 'bad_request', message: 'Valid email required' } });
    if (!b.password || b.password.length < 8) return reply.code(400).send({ error: { code: 'bad_request', message: 'Password must be at least 8 characters' } });

    const existing = await queryOne<{ id: string; password_hash: string | null }>('SELECT id, password_hash FROM app_user WHERE email = $1', [email]);
    if (existing?.password_hash) return reply.code(409).send({ error: { code: 'exists', message: 'An account with this email already exists — log in instead.' } });

    const slug = `${slugify(b.orgName || email.split('@')[0]!)}-${Math.random().toString(36).slice(2, 6)}`;
    const org = await queryOne<{ id: string }>(`INSERT INTO org (name, slug, plan) VALUES ($1,$2,'free') RETURNING id`, [b.orgName || `${email.split('@')[0]}'s team`, slug]);
    const user = await queryOne<{ id: string }>(
      `INSERT INTO app_user (email, name, password_hash) VALUES ($1,$2,$3)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
      [email, email.split('@')[0], hashPassword(b.password)],
    );
    await query(`INSERT INTO membership (org_id, user_id, role) VALUES ($1,$2,'owner')`, [org!.id, user!.id]);
    const key = await keys.create(org!.id, user!.id, 'default');
    const token = signSession({ orgId: org!.id, userId: user!.id, role: 'owner', email });
    await audit.log(org!.id, user!.id, 'auth.signup', email);
    return reply.send({ token, apiKey: key.raw, org: org!.id, email, role: 'owner', plan: 'free' });
  });

  app.post('/auth/login', async (req, reply) => {
    const b = req.body as { email?: string; password?: string };
    const email = (b.email ?? '').trim().toLowerCase();
    const row = await queryOne<{ id: string; password_hash: string | null; org_id: string; role: string }>(
      `SELECT u.id, u.password_hash, m.org_id, m.role
         FROM app_user u JOIN membership m ON m.user_id = u.id
        WHERE u.email = $1 ORDER BY m.role DESC LIMIT 1`,
      [email],
    );
    if (!row || !verifyPassword(b.password ?? '', row.password_hash)) {
      return reply.code(401).send({ error: { code: 'invalid_credentials', message: 'Incorrect email or password' } });
    }
    const token = signSession({ orgId: row.org_id, userId: row.id, role: row.role, email });
    return reply.send({ token, org: row.org_id, email, role: row.role });
  });
}
