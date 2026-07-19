import { query, queryOne } from '../db/pool.js';

export interface McpServerRow {
  id: string;
  org_id: string;
  name: string;
  transport: 'http' | 'stdio';
  url: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
}

/** CRUD for downstream MCP server registrations. */
export class McpServerStore {
  listEnabled(orgId: string): Promise<McpServerRow[]> {
    return query<McpServerRow>('SELECT * FROM mcp_server WHERE org_id = $1 AND enabled = true ORDER BY name', [orgId]);
  }

  list(orgId: string): Promise<McpServerRow[]> {
    return query<McpServerRow>('SELECT * FROM mcp_server WHERE org_id = $1 ORDER BY name', [orgId]);
  }

  async create(
    orgId: string,
    input: { name: string; transport?: 'http' | 'stdio'; url?: string; command?: string; args?: string[]; env?: Record<string, string>; enabled?: boolean },
  ): Promise<McpServerRow> {
    const row = await queryOne<McpServerRow>(
      `INSERT INTO mcp_server (org_id, name, transport, url, command, args, env, enabled)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (org_id, name) DO UPDATE SET
         transport = EXCLUDED.transport, url = EXCLUDED.url, command = EXCLUDED.command,
         args = EXCLUDED.args, env = EXCLUDED.env, enabled = EXCLUDED.enabled
       RETURNING *`,
      [
        orgId,
        input.name,
        input.transport ?? 'http',
        input.url ?? '',
        input.command ?? '',
        JSON.stringify(input.args ?? []),
        JSON.stringify(input.env ?? {}),
        input.enabled ?? true,
      ],
    );
    return row!;
  }

  async remove(orgId: string, id: string): Promise<void> {
    await query('DELETE FROM mcp_server WHERE org_id = $1 AND id = $2', [orgId, id]);
  }
}
