import type { FastifyInstance } from 'fastify';
import { query, queryOne } from '../db/pool.js';
import { getOAuthProvider } from '../auth/oauth.js';
import { signSession } from '../auth/jwt.js';
import { KeyService } from '../services/keyService.js';
import { AuditService } from '../services/auditService.js';
import { events } from '../services/eventService.js';


const keys = new KeyService();
const audit = new AuditService();

function slugify(s: string): string {
  return (s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'org').slice(0, 32);
}

function encodeState(orgSlug: string): string {
  return Buffer.from(JSON.stringify({ org: orgSlug, n: Math.random().toString(36).slice(2) })).toString('base64url');
}

function decodeState(state: string): { org: string } {
  try {
    return JSON.parse(Buffer.from(state, 'base64url').toString('utf-8')) as { org: string };
  } catch {
    return { org: '' };
  }
}

function emailDomain(email: string): string {
  return email.split('@')[1]?.toLowerCase() ?? '';
}

async function resolveOrgByDomain(email: string): Promise<{ id: string; admin_email: string | null } | undefined> {
  const domain = emailDomain(email);
  if (!domain) return undefined;
  return queryOne<{ id: string; admin_email: string | null }>(
    `SELECT id, admin_email FROM org WHERE admin_email ILIKE $1 AND suspended = false ORDER BY created_at DESC LIMIT 1`,
    [`%@${domain}`],
  );
}

/** Provisions (or signs in) an OAuth user and returns a session token. */
async function provisionOAuthUser(
  profile: { email: string; name: string; provider: string; providerUserId: string },
  orgSlug = '',
) {
  const email = profile.email.toLowerCase().trim();
  let user = await queryOne<{ id: string }>('SELECT id FROM app_user WHERE email = $1', [email]);

  if (!user) {
    user = await queryOne<{ id: string }>(
      `INSERT INTO app_user (email, name) VALUES ($1,$2) RETURNING id`,
      [email, profile.name],
    );
  }

  // Link OAuth identity if not already linked.
  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM oauth_identity WHERE provider = $1 AND provider_user_id = $2',
    [profile.provider, profile.providerUserId],
  );
  if (!existing) {
    await query(
      'INSERT INTO oauth_identity (user_id, provider, provider_user_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [user!.id, profile.provider, profile.providerUserId],
    );
  }

  // Find or create an org + membership.
  let membership = await queryOne<{ org_id: string; role: string }>(
    `SELECT org_id, role FROM membership WHERE user_id = $1 ORDER BY role DESC LIMIT 1`,
    [user!.id],
  );

  if (!membership) {
    let targetOrg: { id: string; admin_email: string | null } | undefined;
    if (orgSlug) {
      targetOrg = await queryOne<{ id: string; admin_email: string | null }>('SELECT id, admin_email FROM org WHERE slug = $1', [orgSlug]);
    }
    if (!targetOrg) {
      targetOrg = await resolveOrgByDomain(email);
    }

    if (targetOrg) {
      const role = targetOrg.admin_email && email === targetOrg.admin_email.toLowerCase() ? 'owner' : 'member';
      await query('INSERT INTO membership (org_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [
        targetOrg.id,
        user!.id,
        role,
      ]);
      membership = { org_id: targetOrg.id, role };
    } else {
      const displayName = profile.name || email.split('@')[0] || email;
      const slug = `${slugify(displayName)}-${Math.random().toString(36).slice(2, 6)}`;
      const org = await queryOne<{ id: string }>(
        `INSERT INTO org (name, slug, plan) VALUES ($1,$2,'free') RETURNING id`,
        [`${displayName}'s team`, slug],
      );
      await query('INSERT INTO membership (org_id, user_id, role) VALUES ($1,$2,$3)', [org!.id, user!.id, 'owner']);
      membership = { org_id: org!.id, role: 'owner' };
    }
  }

  const key = await keys.create(membership.org_id, user!.id, 'default');
  const token = signSession({ orgId: membership.org_id, userId: user!.id, role: membership.role, email });
  await audit.log(membership.org_id, user!.id, `auth.oauth_${profile.provider}_login`, email, { provider: profile.provider });
  return { token, apiKey: key.raw, org: membership.org_id, email, role: membership.role };
}

export async function registerOAuthRoutes(app: FastifyInstance): Promise<void> {
  // -- Initiate OAuth login / signup -----------------------------------------
  app.get('/auth/oauth/:provider', async (req, reply) => {
    const { provider: name } = req.params as { provider: string };
    const q = req.query as { org?: string };
    const provider = getOAuthProvider(name);
    if (!provider) return reply.code(400).send({ error: { code: 'bad_request', message: `Unsupported provider: ${name}` } });

    if (name === 'mobile') {
      // Mobile OTP is a placeholder; an SMS gateway is required for real use.
      return reply.code(501).send({ error: { code: 'not_implemented', message: 'Mobile OTP sign-in is not configured on this instance' } });
    }

    const state = encodeState(q.org ?? '');
    return reply.redirect(provider.authorizeUrl(state));
  });

  // -- OAuth callback (signup or login) --------------------------------------
  app.get('/auth/oauth/:provider/callback', async (req, reply) => {
    const { provider: name } = req.params as { provider: string };
    const q = req.query as { code?: string; state?: string; error?: string };
    if (q.error) return reply.code(400).send({ error: { code: 'oauth_denied', message: q.error } });
    if (!q.code) return reply.code(400).send({ error: { code: 'bad_request', message: 'Missing OAuth code' } });

    const provider = getOAuthProvider(name);
    if (!provider) return reply.code(400).send({ error: { code: 'bad_request', message: `Unsupported provider: ${name}` } });

    const { org: orgSlug } = decodeState(q.state ?? '');

    try {
      const profile = await provider.exchangeCode(q.code);
      const result = await provisionOAuthUser(profile, orgSlug);
      void events.record('info', 'auth', 'oauth_login', `OAuth login: ${profile.provider} ${profile.email}`, result.org, { provider: profile.provider });

      // For a real web app you would set a secure, httpOnly cookie here.
      // Returning JSON keeps the current spa-ish localStorage flow intact.
      return reply.send(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.code(500).send({ error: { code: 'oauth_failed', message: msg } });
    }
  });
}
