import type { FastifyInstance } from 'fastify';
import { queryOne, query } from '../db/pool.js';
import { getSsoProvider } from '../auth/sso.js';
import { signSession } from '../auth/jwt.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { getPlan, entitled } from '../billing/entitlements.js';
import { KeyService } from '../services/keyService.js';
import { AuditService } from '../services/auditService.js';
import { config } from '../config.js';
import { createOtp, verifyOtp, peekOtp, storeOtp } from '../services/otpService.js';
import { sendPasswordReset } from '../services/emailService.js';

const audit = new AuditService();
const keys = new KeyService();

function slugify(s: string): string {
  return (s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'org').slice(0, 32);
}

function emailDomain(email: string): string {
  return email.split('@')[1]?.toLowerCase() ?? '';
}

/** Finds the org whose admin email domain matches the user's email domain. */
async function resolveOrgByDomain(email: string): Promise<{ id: string; admin_email: string | null } | undefined> {
  const domain = emailDomain(email);
  if (!domain) return undefined;
  return queryOne<{ id: string; admin_email: string | null }>(
    `SELECT id, admin_email FROM org WHERE admin_email ILIKE $1 AND suspended = false ORDER BY created_at DESC LIMIT 1`,
    [`%@${domain}`],
  );
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
  // Kick off SSO. `org` selects the tenant; when omitted the callback resolves by
  // email domain. `email` is only used by the dev provider.
  app.get('/auth/sso/login', async (req, reply) => {
    const q = req.query as { org?: string; email?: string };
    const orgSlug = q.org ?? '';
    const url = getSsoProvider().authorizeUrl(encodeState(orgSlug), { email: q.email });
    return reply.redirect(url);
  });

  // IdP redirects here with a code; we exchange it, provision the user, issue a JWT.
  app.get('/auth/sso/callback', async (req, reply) => {
    const q = req.query as { code?: string; state?: string };
    if (!q.code) return reply.code(400).send({ error: { code: 'bad_request', message: 'missing code' } });

    let profile;
    try {
      profile = await getSsoProvider().exchangeCode(q.code);
    } catch (err) {
      return reply.code(401).send({ error: { code: 'sso_failed', message: err instanceof Error ? err.message : String(err) } });
    }
    if (!profile.email) return reply.code(401).send({ error: { code: 'sso_failed', message: 'no email in profile' } });

    const { org: orgSlug } = decodeState(q.state ?? '');
    const stateOrg = await queryOne<{ id: string; admin_email: string | null }>('SELECT id, admin_email FROM org WHERE slug = $1', [orgSlug]);

    // Determine the target org. Explicit state slug wins, then same-domain lookup.
    let targetOrg: { id: string; admin_email: string | null } | undefined = stateOrg ?? undefined;
    const user = await queryOne<{ id: string }>(
      `INSERT INTO app_user (email, name) VALUES ($1,$2)
       ON CONFLICT (email) DO UPDATE SET name = COALESCE(NULLIF(EXCLUDED.name,''), app_user.name)
       RETURNING id`,
      [profile.email, profile.name],
    );
    const existingMembership = await queryOne<{ role: string; org_id: string }>(
      `SELECT role, org_id FROM membership WHERE user_id = $1 ORDER BY role DESC LIMIT 1`,
      [user!.id],
    );

    if (existingMembership) {
      // Already a member somewhere; stay there.
      targetOrg = { id: existingMembership.org_id, admin_email: null };
    } else if (!targetOrg) {
      const domainOrg = await resolveOrgByDomain(profile.email);
      targetOrg = domainOrg ?? undefined;
    }

    if (!targetOrg) {
      return reply.code(404).send({ error: { code: 'not_found', message: `No workspace found for "${orgSlug}" or domain ${emailDomain(profile.email)}` } });
    }

    // SSO is an Enterprise feature on the resolved workspace.
    if (!entitled(await getPlan(targetOrg.id), 'sso')) {
      return reply.code(402).send({ error: { code: 'upgrade_required', message: 'SSO requires the Enterprise plan', feature: 'sso' } });
    }

    // First user whose email matches the org's admin_email becomes owner; otherwise member.
    let role = existingMembership?.role ?? 'member';
    if (!existingMembership) {
      role = targetOrg.admin_email && profile.email.toLowerCase() === targetOrg.admin_email.toLowerCase() ? 'owner' : 'member';
      await query(`INSERT INTO membership (org_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT (org_id, user_id) DO NOTHING`, [
        targetOrg.id,
        user!.id,
        role,
      ]);
    }

    const token = signSession({ orgId: targetOrg.id, userId: user!.id, role, email: profile.email });
    await audit.log(targetOrg.id, user!.id, 'auth.sso_login', profile.email, { provider: getSsoProvider().name });

    // Return the token (a real web UI would set a cookie / redirect to the app).
    return reply.send({ token, org: targetOrg.id, email: profile.email, role });
  });

  // Convenience: list SSO config status (no secrets).
  app.get('/auth/sso/info', async () => {
    return { provider: getSsoProvider().name, loginUrl: '/auth/sso/login?org=<slug>' };
  });

  // -- Superadmin OTP login --------------------------------------------------

  app.post('/auth/superadmin/login', async (req, reply) => {
    const b = req.body as { email?: string; password?: string };
    const email = (b.email ?? '').trim().toLowerCase();
    const user = await queryOne<{ id: string; password_hash: string | null; is_platform_admin: boolean }>(
      'SELECT id, password_hash, is_platform_admin FROM app_user WHERE email = $1',
      [email],
    );
    if (!user || !user.is_platform_admin || !verifyPassword(b.password ?? '', user.password_hash)) {
      return reply.code(401).send({ error: { code: 'invalid_credentials', message: 'Incorrect email or password' } });
    }
    await createOtp(email, 'superadmin_login');
    return reply.send({ otpSent: true });
  });

  app.post('/auth/superadmin/verify-otp', async (req, reply) => {
    const b = req.body as { email?: string; code?: string };
    const email = (b.email ?? '').trim().toLowerCase();
    const code = (b.code ?? '').trim();
    if (!await verifyOtp(email, code, 'superadmin_login')) {
      return reply.code(401).send({ error: { code: 'invalid_otp', message: 'Invalid or expired code' } });
    }
    const user = await queryOne<{ id: string }>('SELECT id FROM app_user WHERE email = $1 AND is_platform_admin = true', [email]);
    if (!user) return reply.code(401).send({ error: { code: 'invalid_credentials', message: 'User not found' } });

    // Use the platform org created in seedSuperadmin.
    const membership = await queryOne<{ org_id: string; role: string }>(
      `SELECT org_id, role FROM membership WHERE user_id = $1 ORDER BY role DESC LIMIT 1`,
      [user.id],
    );
    if (!membership) return reply.code(500).send({ error: { code: 'server_error', message: 'Superadmin membership not configured' } });

    const token = signSession({ orgId: membership.org_id, userId: user.id, role: membership.role, email });
    await audit.log(membership.org_id, user.id, 'auth.superadmin_login', email);
    return reply.send({ token, org: membership.org_id, email, role: membership.role });
  });

  // Dev/test helper: read the latest OTP for an email. Hidden unless DEV_SEED is true.
  if (config.devSeed) {
    app.get('/auth/debug/otp', async (req, reply) => {
      const q = req.query as { email?: string; purpose?: string };
      const code = await peekOtp(q.email ?? '', q.purpose ?? 'superadmin_login');
      if (!code) return reply.code(404).send({ error: { code: 'not_found', message: 'No active OTP for that email' } });
      return reply.send({ code });
    });
  }

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
    const row = await queryOne<{ id: string; password_hash: string | null; org_id: string; role: string; is_platform_admin: boolean }>(
      `SELECT u.id, u.password_hash, u.is_platform_admin, m.org_id, m.role
         FROM app_user u JOIN membership m ON m.user_id = u.id
        WHERE u.email = $1 ORDER BY m.role DESC LIMIT 1`,
      [email],
    );
    if (!row || !verifyPassword(b.password ?? '', row.password_hash)) {
      return reply.code(401).send({ error: { code: 'invalid_credentials', message: 'Incorrect email or password' } });
    }
    if (row.is_platform_admin) {
      return reply.code(401).send({ error: { code: 'use_superadmin_login', message: 'Use the superadmin login page' } });
    }
    const token = signSession({ orgId: row.org_id, userId: row.id, role: row.role, email });
    return reply.send({ token, org: row.org_id, email, role: row.role });
  });

  // -- Password reset (customer email/password accounts) -----------------------

  app.post('/auth/forgot-password', async (req, reply) => {
    const b = req.body as { email?: string };
    const email = (b.email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply.code(400).send({ error: { code: 'bad_request', message: 'Valid email required' } });
    }

    const user = await queryOne<{ email: string }>('SELECT email FROM app_user WHERE email = $1 AND is_platform_admin = false', [email]);
    if (user) {
      const { code } = await storeOtp(email, 'password_reset');
      const link = `${config.appBaseUrl.replace(/\/$/, '')}/reset-password?email=${encodeURIComponent(email)}&code=${encodeURIComponent(code)}`;
      await sendPasswordReset(email, code, link);
    }
    // Always return success to prevent email enumeration.
    return reply.send({ sent: true });
  });

  app.post('/auth/reset-password', async (req, reply) => {
    const b = req.body as { email?: string; code?: string; password?: string };
    const email = (b.email ?? '').trim().toLowerCase();
    const code = (b.code ?? '').trim();
    const password = b.password ?? '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply.code(400).send({ error: { code: 'bad_request', message: 'Valid email required' } });
    }
    if (password.length < 8) {
      return reply.code(400).send({ error: { code: 'bad_request', message: 'Password must be at least 8 characters' } });
    }
    if (!await verifyOtp(email, code, 'password_reset')) {
      return reply.code(400).send({ error: { code: 'invalid_code', message: 'Invalid or expired code' } });
    }
    await query('UPDATE app_user SET password_hash = $1 WHERE email = $2 AND is_platform_admin = false', [hashPassword(password), email]);
    return reply.send({ reset: true });
  });
}
