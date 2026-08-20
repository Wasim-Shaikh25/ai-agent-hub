import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, startMockLLM, jfetch, signup, claims, setPlan, closeDb } from './helpers.mjs';

const PORT = 8101;
const MOCK = 4101;
let srv;
let mock;
let base;

before(async () => {
  mock = await startMockLLM(MOCK);
  srv = await startServer(PORT, { LITELLM_URL: `http://localhost:${MOCK}` });
  base = srv.base;
});

after(async () => {
  await srv?.stop();
  await new Promise((r) => mock?.close(r));
  await closeDb();
});

test('health + ready', async () => {
  const h = await jfetch(base, '/health');
  assert.equal(h.status, 200);
  assert.equal(h.body.status, 'ok');
  assert.equal((await jfetch(base, '/ready')).status, 200);
});

test('signup issues a token and /api/me resolves the org', async () => {
  const { token } = await signup(base, 'core');
  assert.ok(token, 'expected a session token');
  const me = await jfetch(base, '/api/me', { token });
  assert.equal(me.status, 200);
  assert.ok(me.body.org);
});

test('entitlements: free org is blocked from a paid feature (402)', async () => {
  const { token } = await signup(base, 'free');
  const plan = await jfetch(base, '/api/plan', { token });
  assert.equal(plan.body.plan, 'free');
  const audit = await jfetch(base, '/api/audit', { token }); // requireFeature('audit')
  assert.equal(audit.status, 402);
  assert.equal(audit.body.error.code, 'upgrade_required');
});

test('entitlements: a paid org is allowed the paid feature', async () => {
  const { token } = await signup(base, 'ent');
  await setPlan(claims(token).orgId, 'paid'); // set before first request so the plan cache is cold
  const audit = await jfetch(base, '/api/audit', { token });
  assert.equal(audit.status, 200);
  assert.ok(Array.isArray(audit.body));
});

test('memory write + search endpoints work', async () => {
  const { token } = await signup(base, 'mem');
  const w = await jfetch(base, '/api/memory', { method: 'POST', token, body: { content: 'we deploy on fridays', kind: 'fact' } });
  assert.equal(w.status, 200);
  assert.ok(w.body.id || w.body.content);
  const s = await jfetch(base, '/api/memory?q=deploy', { token });
  assert.equal(s.status, 200);
  assert.ok(Array.isArray(s.body.results));
});

test('RAG index + query returns the indexed symbol (BM25 path)', async () => {
  const { token } = await signup(base, 'rag');
  const idx = await jfetch(base, '/api/rag/index', { method: 'POST', token, body: { project: 'p1', uri: 'a.ts', content: 'export function zzxxyyUnique() { return 42; }' } });
  assert.equal(idx.status, 200);
  const q = await jfetch(base, '/api/rag/query?project=p1&q=zzxxyyUnique', { token });
  assert.equal(q.status, 200);
  assert.ok((q.body.chunks ?? []).length > 0, 'expected a RAG hit for the indexed symbol');
});

test('gateway forwards to the (mock) provider and meters usage', async () => {
  const { token } = await signup(base, 'gw');
  const chat = await jfetch(base, '/v1/chat/completions', { method: 'POST', token, body: { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] } });
  assert.equal(chat.status, 200);
  assert.ok(chat.body.choices?.[0]);
  const usage = await jfetch(base, '/api/usage', { token });
  assert.equal(usage.status, 200);
  assert.ok('tokens' in usage.body);
});

test('model catalog + per-user model choice', async () => {
  const { token } = await signup(base, 'model');
  const models = await jfetch(base, '/v1/models', { token });
  assert.equal(models.status, 200);
  assert.ok(models.body.data.length > 0);
  const first = models.body.data[0].id;
  const put = await jfetch(base, '/api/me/model', { method: 'PUT', token, body: { model: first } });
  assert.equal(put.status, 200);
  const get = await jfetch(base, '/api/me/model', { token });
  assert.equal(get.body.model, first);
});

test('MCP initialize handshake is detected in /api/agents', async () => {
  const { token } = await signup(base, 'mcp');
  const r = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'cursor', version: '1' } } }),
  });
  const text = await r.text();
  assert.match(text, /"result"/, 'expected an MCP initialize result');
  const agents = await jfetch(base, '/api/agents', { token });
  assert.ok(agents.body.some((a) => a.agent === 'Cursor'), 'expected Cursor to appear as a connected agent');
});
