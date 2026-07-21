import type { FastifyInstance } from 'fastify';
import { queryOne, query } from '../db/pool.js';
import { getSsoProvider } from '../auth/sso.js';
import { signSession } from '../auth/jwt.js';
import { getPlan, entitled } from '../billing/entitlements.js';
import { AuditService } from '../services/auditService.js';

const audit = new AuditService();

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
}
