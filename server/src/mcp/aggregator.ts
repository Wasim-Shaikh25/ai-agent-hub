import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { McpServerStore, type McpServerRow } from '../services/mcpServerStore.js';

interface DownstreamTool {
  serverId: string;
  serverName: string;
  name: string;
  description: string;
  inputSchema: unknown;
}

interface Cached {
  tools: DownstreamTool[];
  ts: number;
}

const TOOL_CACHE_TTL_MS = 30_000;

/**
 * Connects to downstream MCP servers and re-exposes their tools through the
 * Hub's single MCP endpoint. Client connections are cached and reused across
 * requests; tool listings are cached briefly to avoid a round-trip per call.
 */
export class McpAggregator {
  private readonly clients = new Map<string, Client>();
  private readonly toolCache = new Map<string, Cached>();

  constructor(private readonly store = new McpServerStore()) {}

  /** Lists (namespaced) tools across all enabled downstream servers for an org. */
  async listFor(orgId: string): Promise<DownstreamTool[]> {
    const servers = await this.store.listEnabled(orgId);
    const out: DownstreamTool[] = [];
    for (const server of servers) {
      const cached = this.toolCache.get(server.id);
      if (cached && Date.now() - cached.ts < TOOL_CACHE_TTL_MS) {
        out.push(...cached.tools);
        continue;
      }
      try {
        const client = await this.ensure(server);
        const res = await client.listTools();
        const tools: DownstreamTool[] = res.tools.map((t) => ({
          serverId: server.id,
          serverName: server.name,
          name: t.name,
          description: t.description ?? '',
          inputSchema: t.inputSchema,
        }));
        this.toolCache.set(server.id, { tools, ts: Date.now() });
        out.push(...tools);
      } catch (err) {
        // A broken downstream server must not break the Hub's own tools.
        console.error(`[aggregator] ${server.name} listTools failed:`, err instanceof Error ? err.message : err);
        this.drop(server.id);
      }
    }
    return out;
  }

  /** Calls a tool on a specific downstream server; returns its MCP result. */
  async call(orgId: string, serverId: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const servers = await this.store.listEnabled(orgId);
    const server = servers.find((s) => s.id === serverId);
    if (!server) throw new Error('downstream MCP server not found or disabled');
    const client = await this.ensure(server);
    return client.callTool({ name: toolName, arguments: args });
  }

  private async ensure(server: McpServerRow): Promise<Client> {
    const existing = this.clients.get(server.id);
    if (existing) return existing;

    const client = new Client({ name: 'ai-agent-hub-aggregator', version: '0.1.0' });
    const transport =
      server.transport === 'stdio'
        ? new StdioClientTransport({ command: server.command, args: server.args, env: { ...process.env, ...server.env } as Record<string, string> })
        : new StreamableHTTPClientTransport(new URL(server.url));

    await client.connect(transport);
    this.clients.set(server.id, client);
    return client;
  }

  private drop(serverId: string): void {
    const c = this.clients.get(serverId);
    if (c) void c.close().catch(() => undefined);
    this.clients.delete(serverId);
    this.toolCache.delete(serverId);
  }
}

/** Process-wide aggregator instance (persistent downstream connections). */
export const aggregator = new McpAggregator();
