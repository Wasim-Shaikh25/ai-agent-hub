import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, jfetch, signup, claims, makePlatformAdmin, closeDb } from './helpers.mjs';

const PORT = 8102;
let srv;
let base;

before(async () => {
  srv = await startServer(PORT, { RLS_ENABLED: 'true' });
  base = srv.base;
});

after(async () => { await srv?.stop(); await closeDb(); });

test('RLS: one org cannot read another org\'s rows', async () => {
  const A = await signup(base, 'rlsA');
  const B = await signup(base, 'rlsB');
  // A creates a policy
  const c = await jfetch(base, '/api/policies', { method: 'POST', token: A.token, body: { kind: 'budget', spec: { maxTokens: 1 } } });
  assert.equal(c.status, 200);
  const seenByA = await jfetch(base, '/api/policies', { token: A.token });
  const seenByB = await jfetch(base, '/api/policies', { token: B.token });
  assert.equal(seenByA.body.length, 1, 'A should see its own policy');
  assert.equal(seenByB.body.length, 0, 'B must not see A\'s policy');
});

test('RLS: no cross-request bleed on pooled connections', async () => {
  const A = await signup(base, 'bleedA');
  const B = await signup(base, 'bleedB');
  await jfetch(base, '/api/policies', { method: 'POST', token: A.token, body: { kind: 'budget', spec: {} } });
  for (let i = 0; i < 8; i++) {
    const a = await jfetch(base, '/api/policies', { token: A.token });
    const b = await jfetch(base, '/api/policies', { token: B.token });
    assert.equal(a.body.length, 1, `A count wrong on iter ${i}`);
    assert.equal(b.body.length, 0, `B count wrong on iter ${i}`);
  }
});

test('RLS: platform super-admin still reads across every org', async () => {
  // A normal token is blocked; a platform admin bypasses the org binding.
  const admin = await signup(base, 'padmin');
  const denied = await jfetch(base, '/api/platform/orgs', { token: admin.token });
  assert.equal(denied.status, 403, 'non-admin must be denied');
  await makePlatformAdmin(claims(admin.token).userId);
  const orgs = await jfetch(base, '/api/platform/orgs', { token: admin.token });
  assert.equal(orgs.status, 200);
  assert.ok(orgs.body.length >= 2, 'platform admin should see multiple orgs across RLS');
});
