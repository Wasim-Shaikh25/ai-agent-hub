import type { IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import type { AuthContext } from '../auth.js';
import { ContextService } from '../services/contextService.js';
import { ContentService, type ContentType } from '../services/contentService.js';

const context = new ContextService();
const content = new ContentService();

function text(s: string) {
  return { content: [{ type: 'text' as const, text: s }] };
}

/**
 * Builds a fresh MCP server scoped to one authenticated org.
 *
 * The Context Plane tools (sessions/memory/RAG/skills) are exposed here as
 * native MCP tools so any agent (Cursor, Kiro, Claude Code, …) uses them with
 * zero custom integration — replacing the old "curl a rule file" approach.
 */
function buildServer(auth: AuthContext): McpServer {
  const server = new McpServer({ name: 'ai-agent-hub', version: '0.1.0' });
  const org = auth.orgId;

  server.registerTool(
    'session_get_context',
    {
      title: 'Get assembled context',
      description:
        'Returns token-budgeted context for the current work: active rules/skills, session summary, recent turns, relevant memory, and RAG hits.',
      inputSchema: {
        project: z.string(),
        key: z.string(),
        query: z.string().optional(),
        maxTokens: z.number().optional(),
      },
    },
    async (args) => text(await context.assembleContext(org, args)),
  );

  server.registerTool(
    'session_append',
    {
      title: 'Append a session turn',
      description: 'Records a turn in a shared session so other agents see the same history.',
      inputSchema: {
        project: z.string(),
        key: z.string(),
        role: z.enum(['user', 'assistant', 'tool', 'system']),
        content: z.string(),
        agent: z.string().optional(),
      },
    },
    async (args) => {
      const id = await context.appendTurn(org, args);
      return text(`ok:${id}`);
    },
  );

  server.registerTool(
    'memory_write',
    {
      title: 'Write durable memory',
      description: 'Stores a durable fact/decision/preference for semantic recall later.',
      inputSchema: {
        kind: z.enum(['fact', 'decision', 'preference']).optional(),
        content: z.string(),
        project: z.string().optional(),
      },
    },
    async (args) => {
      const id = await context.writeMemory(org, args);
      return text(`ok:${id}`);
    },
  );

  server.registerTool(
    'memory_search',
    {
      title: 'Search memory',
      description: 'Semantic search over durable memory.',
      inputSchema: { query: z.string(), project: z.string().optional(), k: z.number().optional() },
    },
    async (args) => {
      const hits = await context.searchMemory(org, args.query, { project: args.project, k: args.k });
      return text(hits.map((h) => `(${h.kind}, ${h.score.toFixed(2)}) ${h.content}`).join('\n') || '(no matches)');
    },
  );

  server.registerTool(
    'rag_query',
    {
      title: 'RAG query',
      description: 'Retrieves the most relevant indexed document chunks for a project.',
      inputSchema: { project: z.string(), query: z.string(), k: z.number().optional() },
    },
    async (args) => {
      const hits = await context.ragQuery(org, args.project, args.query, args.k ?? 5);
      return text(hits.map((h) => `[${h.score.toFixed(2)}] ${h.uri}\n${h.content}`).join('\n\n') || '(no matches)');
    },
  );

  server.registerTool(
    'rag_index',
    {
      title: 'Index a document',
      description: 'Chunks and embeds a document into the project knowledge base for RAG.',
      inputSchema: { project: z.string(), uri: z.string(), title: z.string().optional(), content: z.string() },
    },
    async (args) => {
      const res = await context.indexDocument(org, args);
      return text(`indexed ${res.chunks} chunk(s) as document ${res.documentId}`);
    },
  );

  server.registerTool(
    'skills_list',
    {
      title: 'List enabled behavior content',
      description: 'Lists the org\'s enabled skills/rules/hooks/workflows/personas.',
      inputSchema: { type: z.enum(['skill', 'rule', 'hook', 'workflow', 'persona']).optional() },
    },
    async (args) => {
      const items = await content.listEnabled(org, args.type as ContentType | undefined);
      return text(items.map((i) => `- [${i.type}] ${i.name}: ${i.description}`).join('\n') || '(none)');
    },
  );

  return server;
}

/**
 * Handles one MCP HTTP request in stateless mode. A fresh server + transport
 * is created per request to avoid cross-request state — fine at current scale.
 */
export async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  body: unknown,
  auth: AuthContext,
): Promise<void> {
  const server = buildServer(auth);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}
