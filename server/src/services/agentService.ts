import { query } from '../db/pool.js';

export interface AgentConnection {
  id: string;
  org_id: string;
  user_id: string | null;
  agent: string;
  raw_name: string;
  version: string;
  source: string;
  last_model: string | null;
  project: string | null;
  seen_count: number;
  first_seen: string;
  last_seen: string;
}

export interface RecordInput {
  orgId: string;
  userId?: string | null;
  rawName: string;
  version?: string;
  source: 'mcp' | 'gateway';
  model?: string;
  project?: string;
}

// Map self-reported client names → friendly display names. Match on substring
// so version suffixes / SDK prefixes still resolve. Unknown names fall through
// to a cleaned-up raw value.
const KNOWN: Array<[RegExp, string]> = [
  [/cursor/i, 'Cursor'],
  [/claude[-_ ]?code|claude-ai|anthropic/i, 'Claude Code'],
  [/cline/i, 'Cline'],
  [/windsurf|codeium/i, 'Windsurf'],
  [/aider/i, 'Aider'],
  [/continue/i, 'Continue'],
  [/codex/i, 'Codex'],
  [/copilot/i, 'GitHub Copilot'],
  [/amazon[-_ ]?q|amazonq/i, 'Amazon Q'],
  [/kiro/i, 'Kiro'],
  [/goose/i, 'Goose'],
  [/vscode|visual.?studio.?code/i, 'VS Code'],
];

/** Normalizes a self-reported client name to a stable display name. */
export function normalizeAgent(raw: string | undefined): string {
  const name = (raw ?? '').trim();
  if (!name) return 'Unknown';
  for (const [re, label] of KNOWN) if (re.test(name)) return label;
  // Fall back to a tidy version of whatever was reported.
  return name.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').slice(0, 40) || 'Unknown';
}

/**
 * Server-side connected-agent detection. Records are best-effort (never throw
 * into the request path) and upsert per (org, agent, source).
 */
export class AgentService {
  async record(input: RecordInput): Promise<void> {
    try {
      const agent = normalizeAgent(input.rawName);
      await query(
        `INSERT INTO agent_connection (org_id, user_id, agent, raw_name, version, source, last_model, project)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (org_id, agent, source) DO UPDATE SET
           user_id    = COALESCE(EXCLUDED.user_id, agent_connection.user_id),
           raw_name   = EXCLUDED.raw_name,
           version    = COALESCE(NULLIF(EXCLUDED.version,''), agent_connection.version),
           last_model = COALESCE(EXCLUDED.last_model, agent_connection.last_model),
           project    = COALESCE(EXCLUDED.project, agent_connection.project),
           seen_count = agent_connection.seen_count + 1,
           last_seen  = now()`,
        [input.orgId, input.userId ?? null, agent, input.rawName.slice(0, 120), (input.version ?? '').slice(0, 40), input.source, input.model ?? null, input.project ?? null],
      );
    } catch {
      /* detection must never break the request it observes */
    }
  }

  /** Connected agents for an org, most-recently-seen first. */
  list(orgId: string): Promise<AgentConnection[]> {
    return query<AgentConnection>('SELECT * FROM agent_connection WHERE org_id = $1 ORDER BY last_seen DESC', [orgId]);
  }
}

export const agents = new AgentService();
