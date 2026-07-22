import type { FastifyInstance } from 'fastify';
import { requireAuth, requireRole, bearer } from '../auth.js';
import { requireFeature, getPlan, planFeatures, PLANS } from '../billing/entitlements.js';
import { ContextService } from '../services/contextService.js';
import { ContentService, type ContentType } from '../services/contentService.js';
import { AuditService } from '../services/auditService.js';

const context = new ContextService();
const content = new ContentService();
const audit = new AuditService();

/** Registers the management REST API under /api. */
export async function registerApiRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/me', { preHandler: requireAuth }, async (req) => {
    return { org: req.auth!.orgId, user: req.auth!.userId, role: req.auth!.role };
  });

  // What this org's plan includes + limits (drives upgrade prompts in clients).
  app.get('/api/plan', { preHandler: requireAuth }, async (req) => {
    const plan = await getPlan(req.auth!.orgId);
    return { plan, features: planFeatures(plan), limits: PLANS[plan].limits };
  });

  // -- content registry -----------------------------------------------------
  app.get('/api/content', { preHandler: requireAuth }, async (req) => {
    const type = (req.query as { type?: ContentType }).type;
    return content.list(req.auth!.orgId, type);
  });

  app.post('/api/content', { preHandler: [requireAuth, requireRole('member')] }, async (req) => {
    const body = req.body as { type: ContentType; name: string; description?: string; body?: string; trigger?: string; enabled?: boolean };
    const actor = { userId: req.auth!.userId, role: req.auth!.role };
    const item = await content.create(req.auth!.orgId, body, actor);
    await audit.log(req.auth!.orgId, req.auth!.userId, 'content.create', item.id, { type: item.type, name: item.name, status: item.status });
    return item;
  });

  app.put('/api/content/:id', { preHandler: [requireAuth, requireRole('member')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const actor = { userId: req.auth!.userId, role: req.auth!.role };
    const updated = await content.update(req.auth!.orgId, id, req.body as Record<string, never>, actor);
    if (!updated) return reply.code(404).send({ error: { code: 'not_found', message: 'content item not found' } });
    await audit.log(req.auth!.orgId, req.auth!.userId, 'content.update', id, { staged: (updated as { staged?: boolean }).staged ?? false });
    return updated;
  });

  app.delete('/api/content/:id', { preHandler: [requireAuth, requireRole('member')] }, async (req) => {
    const { id } = req.params as { id: string };
    await content.remove(req.auth!.orgId, id);
    await audit.log(req.auth!.orgId, req.auth!.userId, 'content.delete', id);
    return { ok: true };
  });

  // -- version history + approvals ------------------------------------------
  app.get('/api/content/:id/versions', { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    return content.listVersions(req.auth!.orgId, id);
  });

  app.post('/api/content/:id/approve', { preHandler: [requireAuth, requireRole('admin'), requireFeature('content_approvals')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const actor = { userId: req.auth!.userId, role: req.auth!.role };
    const item = await content.approve(req.auth!.orgId, id, actor);
    if (!item) return reply.code(404).send({ error: { code: 'not_found', message: 'content item not found' } });
    await audit.log(req.auth!.orgId, req.auth!.userId, 'content.approve', id, { version: item.version });
    return item;
  });

  app.post('/api/content/:id/rollback', { preHandler: [requireAuth, requireRole('admin')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const version = Number((req.body as { version?: number }).version);
    const actor = { userId: req.auth!.userId, role: req.auth!.role };
    const item = await content.rollback(req.auth!.orgId, id, version, actor);
    if (!item) return reply.code(404).send({ error: { code: 'not_found', message: 'item or version not found' } });
    await audit.log(req.auth!.orgId, req.auth!.userId, 'content.rollback', id, { toVersion: version });
    return item;
  });

  // -- sessions -------------------------------------------------------------
  app.get('/api/sessions/:project/:key', { preHandler: requireAuth }, async (req, reply) => {
    const { project, key } = req.params as { project: string; key: string };
    const s = await context.getSession(req.auth!.orgId, project, key);
    if (!s) return reply.code(404).send({ error: { code: 'not_found', message: 'session not found' } });
    return s;
  });

  app.post('/api/sessions/:project/:key/turns', { preHandler: requireAuth }, async (req) => {
    const { project, key } = req.params as { project: string; key: string };
    const b = req.body as { role: string; content: string; agent?: string };
    const id = await context.appendTurn(req.auth!.orgId, { project, key, ...b });
    return { ok: true, turnId: id };
  });

  app.post('/api/sessions/:project/:key/summarize', { preHandler: [requireAuth, requireRole('member')] }, async (req) => {
    const { project, key } = req.params as { project: string; key: string };
    return { summary: await context.summarizeSession(req.auth!.orgId, project, key) };
  });

  app.post('/api/sessions/:project/:key/extract-memory', { preHandler: [requireAuth, requireRole('member')] }, async (req) => {
    const { project, key } = req.params as { project: string; key: string };
    return context.extractSessionMemory(req.auth!.orgId, project, key, req.auth!.userId);
  });

  app.get('/api/context/:project/:key', { preHandler: requireAuth }, async (req) => {
    const { project, key } = req.params as { project: string; key: string };
    const q = req.query as { query?: string; maxTokens?: string };
    const out = await context.assembleContext(req.auth!.orgId, {
      project,
      key,
      query: q.query,
      maxTokens: q.maxTokens ? Number(q.maxTokens) : undefined,
    });
    return { context: out };
  });

  // -- memory ---------------------------------------------------------------
  app.get('/api/memory', { preHandler: requireAuth }, async (req) => {
    const q = req.query as { q?: string; project?: string; k?: string };
    if (!q.q) return { results: [] };
    return { results: await context.searchMemory(req.auth!.orgId, q.q, { project: q.project, k: q.k ? Number(q.k) : undefined, authorId: req.auth!.userId }) };
  });

  app.post('/api/memory', { preHandler: [requireAuth, requireRole('member')] }, async (req) => {
    const b = req.body as { kind?: string; content: string; project?: string; visibility?: string };
    const id = await context.writeMemory(req.auth!.orgId, { ...b, authorId: req.auth!.userId });
    return { ok: true, id };
  });

  // -- RAG ------------------------------------------------------------------
  app.post('/api/rag/index', { preHandler: requireAuth }, async (req) => {
    const b = req.body as { project: string; uri: string; title?: string; content: string; path?: string; language?: string };
    return context.indexDocument(req.auth!.orgId, b);
  });

  // Batch index (auto-index a whole repo). Re-indexing replaces each file.
  app.post('/api/rag/index-batch', { preHandler: [requireAuth, requireRole('member')] }, async (req) => {
    const b = req.body as { project: string; files: Array<{ path: string; content: string; uri?: string }> };
    let documents = 0;
    let chunks = 0;
    for (const f of (b.files ?? []).slice(0, 2000)) {
      if (!f?.path || typeof f.content !== 'string') continue;
      const r = await context.indexDocument(req.auth!.orgId, { project: b.project, uri: f.uri ?? f.path, path: f.path, content: f.content });
      documents++;
      chunks += r.chunks;
    }
    return { documents, chunks };
  });

  app.get('/api/rag/query', { preHandler: requireAuth }, async (req) => {
    const q = req.query as { project: string; q: string; k?: string; mode?: 'hybrid' | 'dense' | 'sparse'; uri?: string; rerank?: 'none' | 'llm' };
    return { chunks: await context.ragQuery(req.auth!.orgId, q.project, q.q, q.k ? Number(q.k) : 5, q.mode ?? 'hybrid', q.uri, q.rerank ?? 'none') };
  });

  // Retrieval eval harness: measure recall@k / MRR / precision on a labeled set.
  app.post('/api/rag/eval', { preHandler: [requireAuth, requireRole('member')] }, async (req) => {
    const b = req.body as { project: string; cases: Array<{ query: string; relevant: string[] }>; k?: number; mode?: 'hybrid' | 'dense' | 'sparse' };
    return context.evalRetrieval(req.auth!.orgId, b.project, b.cases ?? [], b.k ?? 5, b.mode ?? 'hybrid');
  });

  // Diagnostics-aware retrieval: referenced code for compiler/lint errors.
  app.post('/api/rag/diagnostics', { preHandler: requireAuth }, async (req) => {
    const b = req.body as { project: string; diagnostics: string[]; k?: number };
    return { chunks: await context.diagnosticsContext(req.auth!.orgId, b.project, b.diagnostics ?? [], b.k ?? 4) };
  });

  // Knowledge map: navigate specs/docs before drilling into chunks.
  app.get('/api/rag/map', { preHandler: requireAuth }, async (req) => {
    const q = req.query as { project?: string };
    return { map: await context.knowledgeMap(req.auth!.orgId, q.project) };
  });

  // -- native MCP config snippet per agent ----------------------------------
  app.get('/api/mcp-config', { preHandler: requireAuth }, async (req) => {
    const q = req.query as { agent?: string; project?: string; session?: string };
    const key = bearer(req.headers.authorization) ?? '<YOUR_API_KEY>';
    const port = process.env.PORT ?? '8080';
    const url = `http://localhost:${port}/mcp`;
    return buildMcpConfig(q.agent ?? 'cursor', url, key, q.project, q.session);
  });
}

function buildMcpConfig(agent: string, url: string, key: string, project?: string, session?: string): { agent: string; file: string; config: unknown; note: string } {
  const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
  // Auto-binding: bind this workspace to its repo (project) and branch (session)
  // so every MCP call from here targets the right context automatically.
  if (project) headers['X-Hub-Project'] = project;
  if (session) headers['X-Hub-Session'] = session;
  const server = { url, headers };
  switch (agent) {
    case 'claude':
    case 'claude-code':
      return { agent: 'claude-code', file: '.mcp.json', config: { mcpServers: { 'ai-agent-hub': server } }, note: 'Place in project root; Claude Code reads .mcp.json.' };
    case 'windsurf':
      return { agent: 'windsurf', file: '~/.codeium/windsurf/mcp_config.json', config: { mcpServers: { 'ai-agent-hub': server } }, note: 'Windsurf MCP config.' };
    case 'cline':
      return { agent: 'cline', file: '.cline/mcp.json', config: { mcpServers: { 'ai-agent-hub': server } }, note: 'Cline MCP config (or add via Cline → MCP Servers). Set provider "OpenAI Compatible" → base URL <hub>/v1.' };
    case 'kiro':
      return { agent: 'kiro', file: '.kiro/settings/mcp.json', config: { mcpServers: { 'ai-agent-hub': server } }, note: 'Kiro MCP config (workspace .kiro/settings/mcp.json or ~/.kiro/settings/mcp.json).' };
    case 'vscode':
      return { agent: 'vscode', file: '.vscode/mcp.json', config: { servers: { 'ai-agent-hub': { type: 'http', ...server } } }, note: 'VS Code MCP config.' };
    case 'cursor':
    default:
      return { agent: 'cursor', file: '.cursor/mcp.json', config: { mcpServers: { 'ai-agent-hub': server } }, note: 'Place in project root or ~/.cursor/mcp.json.' };
  }
}
