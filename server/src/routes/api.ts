import type { FastifyInstance } from 'fastify';
import { requireAuth, bearer } from '../auth.js';
import { ContextService } from '../services/contextService.js';
import { ContentService, type ContentType } from '../services/contentService.js';

const context = new ContextService();
const content = new ContentService();

/** Registers the management REST API under /api. */
export async function registerApiRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/me', { preHandler: requireAuth }, async (req) => {
    return { org: req.auth!.orgId, user: req.auth!.userId, role: req.auth!.role };
  });

  // -- content registry -----------------------------------------------------
  app.get('/api/content', { preHandler: requireAuth }, async (req) => {
    const type = (req.query as { type?: ContentType }).type;
    return content.list(req.auth!.orgId, type);
  });

  app.post('/api/content', { preHandler: requireAuth }, async (req) => {
    const body = req.body as { type: ContentType; name: string; description?: string; body?: string; trigger?: string; enabled?: boolean };
    return content.create(req.auth!.orgId, body);
  });

  app.put('/api/content/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const updated = await content.update(req.auth!.orgId, id, req.body as Record<string, never>);
    if (!updated) return reply.code(404).send({ error: { code: 'not_found', message: 'content item not found' } });
    return updated;
  });

  app.delete('/api/content/:id', { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    await content.remove(req.auth!.orgId, id);
    return { ok: true };
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
    return { results: await context.searchMemory(req.auth!.orgId, q.q, { project: q.project, k: q.k ? Number(q.k) : undefined }) };
  });

  app.post('/api/memory', { preHandler: requireAuth }, async (req) => {
    const b = req.body as { kind?: string; content: string; project?: string };
    const id = await context.writeMemory(req.auth!.orgId, b);
    return { ok: true, id };
  });

  // -- RAG ------------------------------------------------------------------
  app.post('/api/rag/index', { preHandler: requireAuth }, async (req) => {
    const b = req.body as { project: string; uri: string; title?: string; content: string };
    return context.indexDocument(req.auth!.orgId, b);
  });

  app.get('/api/rag/query', { preHandler: requireAuth }, async (req) => {
    const q = req.query as { project: string; q: string; k?: string };
    return { chunks: await context.ragQuery(req.auth!.orgId, q.project, q.q, q.k ? Number(q.k) : 5) };
  });

  // -- native MCP config snippet per agent ----------------------------------
  app.get('/api/mcp-config', { preHandler: requireAuth }, async (req) => {
    const agent = (req.query as { agent?: string }).agent ?? 'cursor';
    const key = bearer(req.headers.authorization) ?? '<YOUR_API_KEY>';
    const port = process.env.PORT ?? '8080';
    const url = `http://localhost:${port}/mcp`;
    return buildMcpConfig(agent, url, key);
  });
}

function buildMcpConfig(agent: string, url: string, key: string): { agent: string; file: string; config: unknown; note: string } {
  const server = { url, headers: { Authorization: `Bearer ${key}` } };
  switch (agent) {
    case 'claude':
    case 'claude-code':
      return { agent: 'claude-code', file: '.mcp.json', config: { mcpServers: { 'ai-agent-hub': server } }, note: 'Place in project root; Claude Code reads .mcp.json.' };
    case 'windsurf':
      return { agent: 'windsurf', file: '~/.codeium/windsurf/mcp_config.json', config: { mcpServers: { 'ai-agent-hub': server } }, note: 'Windsurf MCP config.' };
    case 'vscode':
      return { agent: 'vscode', file: '.vscode/mcp.json', config: { servers: { 'ai-agent-hub': { type: 'http', ...server } } }, note: 'VS Code MCP config.' };
    case 'cursor':
    default:
      return { agent: 'cursor', file: '.cursor/mcp.json', config: { mcpServers: { 'ai-agent-hub': server } }, note: 'Place in project root or ~/.cursor/mcp.json.' };
  }
}
