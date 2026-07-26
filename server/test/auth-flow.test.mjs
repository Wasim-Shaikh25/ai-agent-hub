import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, jfetch, closeDb } from './helpers.mjs';

const SUPERADMIN = { email: 'super@test.local', password: 'SuperAdmin123!' };
const TS = Date.now();
const ORG = { slug: `acme-${TS}`, name: 'Acme Corp', adminEmail: `admin-${TS}@acme.com`, domain: `acme.com` };

function state(org) {
  return Buffer.from(JSON.stringify({ org, n: Math.random().toString(36).slice(2) })).toString('base64url');
}

async function ssoCallback(base, email, orgSlug) {
  const code = `dev:${email}`;
  return jfetch(base, `/auth/sso/callback?code=${encodeURIComponent(code)}&state=${state(orgSlug)}`);
}

async function ssoCallbackByDomain(base, email) {
  // Empty org slug in state — should resolve by email domain.
  const code = `dev:${email}`;
  return jfetch(base, `/auth/sso/callback?code=${encodeURIComponent(code)}&state=${state('')}`);
}

describe('auth flow and dashboards', () => {
  let server;
  before(async () => {
    server = await startServer(18081, {
      SUPERADMIN_EMAIL: SUPERADMIN.email,
      SUPERADMIN_PASSWORD: SUPERADMIN.password,
      SUPERADMIN_MOBILE: '+1-000-000-0000',
      SSO_PROVIDER: 'dev',
      LOG_LEVEL: 'silent',
    });
  });

  after(async () => {
    await server.stop();
    await closeDb();
  });

  it('superadmin can log in via OTP', async () => {
    const step1 = await jfetch(server.base, '/auth/superadmin/login', {
      method: 'POST',
      body: { email: SUPERADMIN.email, password: SUPERADMIN.password },
    });
    assert.equal(step1.status, 200);
    assert.equal(step1.body.otpSent, true);

    const otpRes = await jfetch(server.base, `/auth/debug/otp?email=${encodeURIComponent(SUPERADMIN.email)}`);
    assert.equal(otpRes.status, 200);
    assert.ok(otpRes.body.code, 'OTP should be readable in dev mode');

    const step2 = await jfetch(server.base, '/auth/superadmin/verify-otp', {
      method: 'POST',
      body: { email: SUPERADMIN.email, code: otpRes.body.code },
    });
    assert.equal(step2.status, 200);
    assert.ok(step2.body.token);
    assert.equal(step2.body.role, 'owner');
    server.superToken = step2.body.token;
  });

  it('superadmin can create an org with an admin email', async () => {
    const res = await jfetch(server.base, '/api/platform/orgs', {
      method: 'POST',
      token: server.superToken,
      body: { name: ORG.name, slug: ORG.slug, adminEmail: ORG.adminEmail, plan: 'enterprise' },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.slug, ORG.slug);
    assert.equal(res.body.adminEmail, ORG.adminEmail);
    assert.equal(res.body.plan, 'enterprise');
  });

  it('org admin can sign in via SSO and becomes owner', async () => {
    const res = await ssoCallback(server.base, ORG.adminEmail, ORG.slug);
    assert.equal(res.status, 200);
    assert.equal(res.body.role, 'owner');
    server.adminToken = res.body.token;
  });

  it('org admin can see the team in the admin dashboard', async () => {
    const res = await jfetch(server.base, '/api/members', { token: server.adminToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].email, ORG.adminEmail);
  });

  it('org admin can promote another user to admin', async () => {
    const userEmail = `dev1-${TS}@acme.com`;
    const userRes = await ssoCallback(server.base, userEmail, ORG.slug);
    assert.equal(userRes.status, 200);
    const userId = (await jfetch(server.base, '/api/members', { token: server.adminToken })).body.find((m) => m.email === userEmail)?.userId;
    assert.ok(userId);

    const promote = await jfetch(server.base, `/api/members/${userId}`, {
      method: 'PUT',
      token: server.adminToken,
      body: { role: 'admin' },
    });
    assert.equal(promote.status, 200);
  });

  it('same-domain SSO user auto-joins the org as member', async () => {
    const res = await ssoCallbackByDomain(server.base, `dev2-${TS}@acme.com`);
    assert.equal(res.status, 200);
    assert.equal(res.body.role, 'member');
    server.memberToken = res.body.token;

    const members = await jfetch(server.base, '/api/members', { token: server.adminToken });
    assert.equal(members.body.length, 3);
  });

  it('user activity dashboard returns their own usage', async () => {
    const res = await jfetch(server.base, '/api/me/activity', { token: server.memberToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.period, 'month');
    assert.ok(Array.isArray(res.body.byModel));
    assert.ok(Array.isArray(res.body.recent));
  });

  it('superadmin dashboard pages are visible', async () => {
    for (const path of ['/superadmin-login', '/superadmin']) {
      const res = await fetch(`${server.base}${path}`);
      const text = await res.text();
      assert.equal(res.status, 200);
      assert.ok(text.includes('Superadmin') || text.includes('Platform'), `${path} should render dashboard`);
    }
  });

  it('admin dashboard pages are visible', async () => {
    const res = await fetch(`${server.base}/admin`);
    const text = await res.text();
    assert.equal(res.status, 200);
    assert.ok(text.includes('Admin') || text.includes('Team'), '/admin should render dashboard');
  });

  it('user dashboard pages are visible', async () => {
    for (const path of ['/activity', '/account']) {
      const res = await fetch(`${server.base}${path}`);
      const text = await res.text();
      assert.equal(res.status, 200);
      assert.ok(text.includes('activity') || text.includes('workspace'), `${path} should render dashboard`);
    }
  });

  it('user can reset their password via email OTP', async () => {
    const email = `reset-${TS}@acme.com`;
    const oldPw = 'oldpass123';
    const newPw = 'newpass456';
    const signup = await jfetch(server.base, '/auth/signup', { method: 'POST', body: { email, password: oldPw, orgName: 'ResetTest' } });
    assert.equal(signup.status, 200);

    const forgot = await jfetch(server.base, '/auth/forgot-password', { method: 'POST', body: { email } });
    assert.equal(forgot.status, 200);
    assert.equal(forgot.body.sent, true);

    const otpRes = await jfetch(server.base, `/auth/debug/otp?email=${encodeURIComponent(email)}&purpose=password_reset`);
    assert.equal(otpRes.status, 200);
    assert.ok(otpRes.body.code);

    const reset = await jfetch(server.base, '/auth/reset-password', { method: 'POST', body: { email, code: otpRes.body.code, password: newPw } });
    assert.equal(reset.status, 200);
    assert.equal(reset.body.reset, true);

    const loginOld = await jfetch(server.base, '/auth/login', { method: 'POST', body: { email, password: oldPw } });
    assert.equal(loginOld.status, 401);

    const loginNew = await jfetch(server.base, '/auth/login', { method: 'POST', body: { email, password: newPw } });
    assert.equal(loginNew.status, 200);
    assert.ok(loginNew.body.token);
  });

  it('forgot and reset password pages are visible', async () => {
    for (const path of ['/forgot-password', '/reset-password?email=foo@bar.com&code=123456']) {
      const res = await fetch(`${server.base}${path}`);
      const text = await res.text();
      assert.equal(res.status, 200);
      assert.ok(text.includes('password'), `${path} should render password page`);
    }
  });

  it('admin APIs reject non-admin members', async () => {
    const res = await jfetch(server.base, '/api/members', { token: server.memberToken });
    assert.equal(res.status, 403);
  });

  it('superadmin platform endpoints see all orgs', async () => {
    const res = await jfetch(server.base, '/api/platform/orgs', { token: server.superToken });
    assert.equal(res.status, 200);
    const acme = res.body.find((o) => o.slug === ORG.slug);
    assert.ok(acme);
    assert.equal(Number(acme.seats), 3);
  });
});
