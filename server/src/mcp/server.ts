import type { IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { type AuthContext, hasRole } from '../auth.js';
import { ContextService } from '../services/contextService.js';
import { ContentService, type ContentType } from '../services/contentService.js';
import { aggregator } from './aggregator.js';
import { jsonSchemaToZodShape } from './jsonSchema.js';

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

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
interface McpDefaults {
  project?: string;
  key?: string;
}

async function buildServer(auth: AuthContext, defaults: McpDefaults = {}): Promise<McpServer> {
  const server = new McpServer({ name: 'ai-agent-hub', version: '0.1.0' });
  const org = auth.orgId;
  const canWrite = hasRole(auth.role, 'member'); // viewers get read-only tools
  // Auto-binding: project defaults to the workspace's repo, key to its branch
  // (stamped into the MCP config by `aihub connect`), so agents don't guess.
  const P = (p?: string): string => p ?? defaults.project ?? 'default';
  const K = (k?: string): string => k ?? defaults.key ?? 'default';

  server.registerTool(
    'session_get_context',
    {
      title: 'Get assembled context',
      description:
        'Returns token-budgeted context for the current work: active rules/skills, session summary, recent turns, relevant memory, and RAG hits.',
      inputSchema: {
        project: z.string().optional(),
        key: z.string().optional(),
        query: z.string().optional(),
        maxTokens: z.number().optional(),
      },
    },
    async (args) => text(await context.assembleContext(org, {
      project: P(args.project), key: K(args.key), query: args.query, maxTokens: args.maxTokens, authorId: auth.userId,
    })),
  );

  if (canWrite) {
  server.registerTool(
    'session_append',
    {
      title: 'Append a session turn',
      description: 'Records a turn in a shared session so other agents see the same history.',
      inputSchema: {
        project: z.string().optional(),
        key: z.string().optional(),
        role: z.enum(['user', 'assistant', 'tool', 'system']),
        content: z.string(),
        agent: z.string().optional(),
      },
    },
    async (args) => {
      const id = await context.appendTurn(org, { ...args, project: P(args.project), key: K(args.key) });
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
        visibility: z.enum(['org', 'project', 'private']).optional(),
      },
    },
    async (args) => {
      const id = await context.writeMemory(org, { ...args, project: P(args.project), authorId: auth.userId });
      return text(`ok:${id}`);
    },
  );
  } // end canWrite (session_append, memory_write)

  server.registerTool(
    'memory_search',
    {
      title: 'Search memory',
      description: 'Semantic search over durable memory.',
      inputSchema: { query: z.string(), project: z.string().optional(), k: z.number().optional() },
    },
    async (args) => {
      const hits = await context.searchMemory(org, args.query, { project: P(args.project), k: args.k, authorId: auth.userId });
      return text(hits.map((h) => `(${h.kind}, ${h.score.toFixed(2)}) ${h.content}`).join('\n') || '(no matches)');
    },
  );

  server.registerTool(
    'rag_query',
    {
      title: 'RAG query (hybrid code-aware)',
      description: 'Hybrid (dense + BM25) retrieval over indexed code/docs, reranked so exact symbol/API matches surface. Returns path:symbol-cited chunks.',
      inputSchema: {
        project: z.string().optional(),
        query: z.string(),
        k: z.number().optional(),
        mode: z.enum(['hybrid', 'dense', 'sparse']).optional(),
      },
    },
    async (args) => {
      const hits = await context.ragQuery(org, P(args.project), args.query, args.k ?? 5, args.mode ?? 'hybrid');
      return text(
        hits
          .map((h) => {
            const loc = h.symbol ? `${h.path || h.uri}:${h.symbol}` : h.path || h.uri;
            return `[${h.score.toFixed(3)}] ${loc}\n${h.content}`;
          })
          .join('\n\n') || '(no matches)',
      );
    },
  );

  if (canWrite) {
  server.registerTool(
    'rag_index',
    {
      title: 'Index a document',
      description: 'Chunks and embeds a document into the project knowledge base for RAG.',
      inputSchema: { project: z.string().optional(), uri: z.string(), title: z.string().optional(), content: z.string() },
    },
    async (args) => {
      const res = await context.indexDocument(org, { ...args, project: P(args.project) });
      return text(`indexed ${res.chunks} chunk(s) as document ${res.documentId}`);
    },
  );
  }

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

  // Aggregate downstream MCP servers: expose their tools namespaced
  // <server>__<tool>. Gated behind member+ since downstream tools may mutate.
  if (canWrite) {
    try {
      const downstream = await aggregator.listFor(org);
      for (const d of downstream) {
        const proxyName = `${slug(d.serverName)}__${d.name}`;
        server.registerTool(
          proxyName,
          {
            title: d.name,
            description: `[via ${d.serverName}] ${d.description}`,
            inputSchema: jsonSchemaToZodShape(d.inputSchema),
          },
          async (args) => (await aggregator.call(org, d.serverId, d.name, args as Record<string, unknown>)) as never,
        );
      }
    } catch (err) {
      console.error('[mcp] downstream aggregation skipped:', err instanceof Error ? err.message : err);
    }
  }

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
  // Auto-binding defaults stamped by `aihub connect` into the MCP config headers.
  const hdr = (name: string): string | undefined => {
    const v = req.headers[name];
    return Array.isArray(v) ? v[0] : v;
  };
  const defaults: McpDefaults = { project: hdr('x-hub-project'), key: hdr('x-hub-session') };

  const server = await buildServer(auth, defaults);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}
