import { query, queryOne } from '../db/pool.js';
import { embed, toVectorLiteral } from '../util/embeddings.js';
import { ContentService } from './contentService.js';

export interface MemoryHit {
  id: string;
  kind: string;
  content: string;
  score: number;
}

export interface RagHit {
  uri: string;
  content: string;
  score: number;
}

export interface TurnRecord {
  role: string;
  agent: string;
  content: string;
  created_at: string;
}

/**
 * The Context Plane: shared sessions, external memory, per-project RAG, and
 * the context assembler that stitches them into a token-budgeted payload any
 * agent can consume.
 */
export class ContextService {
  constructor(private readonly content = new ContentService()) {}

  // -- projects -------------------------------------------------------------

  /** Resolves (or creates) a project by name within an org. */
  async ensureProject(orgId: string, name: string): Promise<string> {
    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM project WHERE org_id = $1 AND name = $2',
      [orgId, name],
    );
    if (existing) return existing.id;
    const created = await queryOne<{ id: string }>(
      'INSERT INTO project (org_id, name) VALUES ($1,$2) ON CONFLICT (org_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
      [orgId, name],
    );
    return created!.id;
  }

  // -- memory ---------------------------------------------------------------

  async writeMemory(orgId: string, input: { kind?: string; content: string; project?: string; source?: string }): Promise<string> {
    const projectId = input.project ? await this.ensureProject(orgId, input.project) : null;
    const vec = toVectorLiteral(await embed(input.content));
    const row = await queryOne<{ id: string }>(
      `INSERT INTO memory (org_id, project_id, kind, content, embedding, source)
       VALUES ($1,$2,$3,$4,$5::vector,$6) RETURNING id`,
      [orgId, projectId, input.kind ?? 'fact', input.content, vec, input.source ?? ''],
    );
    return row!.id;
  }

  async searchMemory(orgId: string, queryText: string, opts: { project?: string; k?: number } = {}): Promise<MemoryHit[]> {
    const k = Math.min(Math.max(opts.k ?? 5, 1), 50);
    const vec = toVectorLiteral(await embed(queryText));
    const projectId = opts.project ? await this.ensureProject(orgId, opts.project) : null;
    const rows = await query<{ id: string; kind: string; content: string; distance: number }>(
      `SELECT id, kind, content, (embedding <=> $2::vector) AS distance
         FROM memory
        WHERE org_id = $1
          AND embedding IS NOT NULL
          AND ($3::uuid IS NULL OR project_id = $3::uuid OR project_id IS NULL)
        ORDER BY embedding <=> $2::vector
        LIMIT $4`,
      [orgId, vec, projectId, k],
    );
    return rows.map((r) => ({ id: r.id, kind: r.kind, content: r.content, score: 1 - Number(r.distance) }));
  }

  // -- sessions -------------------------------------------------------------

  private async ensureSession(orgId: string, projectId: string, key: string): Promise<string> {
    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM session WHERE org_id = $1 AND project_id = $2 AND key = $3',
      [orgId, projectId, key],
    );
    if (existing) return existing.id;
    const created = await queryOne<{ id: string }>(
      `INSERT INTO session (org_id, project_id, key) VALUES ($1,$2,$3)
       ON CONFLICT (org_id, project_id, key) DO UPDATE SET updated_at = now()
       RETURNING id`,
      [orgId, projectId, key],
    );
    return created!.id;
  }

  async appendTurn(orgId: string, input: { project: string; key: string; role: string; content: string; agent?: string }): Promise<string> {
    const projectId = await this.ensureProject(orgId, input.project);
    const sessionId = await this.ensureSession(orgId, projectId, input.key);
    const row = await queryOne<{ id: string }>(
      `INSERT INTO turn (session_id, role, agent, content) VALUES ($1,$2,$3,$4) RETURNING id`,
      [sessionId, input.role, input.agent ?? '', input.content],
    );
    await query('UPDATE session SET updated_at = now() WHERE id = $1', [sessionId]);
    return row!.id;
  }

  async getSession(orgId: string, project: string, key: string, limit = 20): Promise<{ summary: string; turns: TurnRecord[] } | undefined> {
    const projectId = await this.ensureProject(orgId, project);
    const session = await queryOne<{ id: string; summary: string }>(
      'SELECT id, summary FROM session WHERE org_id = $1 AND project_id = $2 AND key = $3',
      [orgId, projectId, key],
    );
    if (!session) return undefined;
    const turns = await query<TurnRecord>(
      `SELECT role, agent, content, created_at
         FROM turn WHERE session_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [session.id, limit],
    );
    return { summary: session.summary, turns: turns.reverse() };
  }

  // -- RAG ------------------------------------------------------------------

  async indexDocument(orgId: string, input: { project: string; uri: string; title?: string; content: string }): Promise<{ documentId: string; chunks: number }> {
    const projectId = await this.ensureProject(orgId, input.project);
    const doc = await queryOne<{ id: string }>(
      `INSERT INTO document (org_id, project_id, uri, title) VALUES ($1,$2,$3,$4) RETURNING id`,
      [orgId, projectId, input.uri, input.title ?? input.uri],
    );
    const chunks = chunkText(input.content);
    let ord = 0;
    for (const c of chunks) {
      const vec = toVectorLiteral(await embed(c));
      await query(
        `INSERT INTO chunk (document_id, ord, content, embedding) VALUES ($1,$2,$3,$4::vector)`,
        [doc!.id, ord++, c, vec],
      );
    }
    return { documentId: doc!.id, chunks: chunks.length };
  }

  async ragQuery(orgId: string, project: string, queryText: string, k = 5): Promise<RagHit[]> {
    const projectId = await this.ensureProject(orgId, project);
    const vec = toVectorLiteral(await embed(queryText));
    const rows = await query<{ uri: string; content: string; distance: number }>(
      `SELECT d.uri, c.content, (c.embedding <=> $2::vector) AS distance
         FROM chunk c
         JOIN document d ON d.id = c.document_id
        WHERE d.org_id = $1 AND d.project_id = $3
          AND c.embedding IS NOT NULL
        ORDER BY c.embedding <=> $2::vector
        LIMIT $4`,
      [orgId, vec, projectId, Math.min(Math.max(k, 1), 50)],
    );
    return rows.map((r) => ({ uri: r.uri, content: r.content, score: 1 - Number(r.distance) }));
  }

  // -- context assembler ----------------------------------------------------

  /**
   * Builds the minimal-correct context for a request: active rules/skills +
   * rolling session summary + recent turns + top-k RAG + relevant memory,
   * trimmed to a rough token budget (~4 chars/token).
   */
  async assembleContext(orgId: string, input: { project: string; key: string; query?: string; maxTokens?: number }): Promise<string> {
    const budgetChars = (input.maxTokens ?? 2000) * 4;
    const q = input.query ?? '';
    const parts: string[] = [];

    // 1. Governance: enabled rules + skills
    const rules = await this.content.listEnabled(orgId, 'rule');
    const skills = await this.content.listEnabled(orgId, 'skill');
    if (rules.length) {
      parts.push('## Active Rules\n' + rules.map((r) => `- **${r.name}**: ${r.description || r.body.slice(0, 160)}`).join('\n'));
    }
    if (skills.length) {
      parts.push('## Active Skills\n' + skills.map((s) => `- **${s.name}**: ${s.description || s.body.slice(0, 160)}`).join('\n'));
    }

    // 2. Session continuity
    const session = await this.getSession(orgId, input.project, input.key, 8);
    if (session?.summary) parts.push('## Session Summary\n' + session.summary);
    if (session?.turns.length) {
      parts.push(
        '## Recent Turns\n' +
          session.turns.map((t) => `- [${t.role}${t.agent ? '/' + t.agent : ''}] ${t.content.slice(0, 200)}`).join('\n'),
      );
    }

    // 3. Relevant memory
    if (q) {
      const mem = await this.searchMemory(orgId, q, { project: input.project, k: 5 });
      if (mem.length) parts.push('## Relevant Memory\n' + mem.map((m) => `- (${m.kind}) ${m.content}`).join('\n'));

      // 4. RAG over the project
      const rag = await this.ragQuery(orgId, input.project, q, 5);
      if (rag.length) parts.push('## Retrieved Context\n' + rag.map((r) => `- ${r.uri}: ${r.content.slice(0, 240)}`).join('\n'));
    }

    let out = parts.join('\n\n');
    if (out.length > budgetChars) out = out.slice(0, budgetChars) + '\n\n…(trimmed to token budget)';
    return out || '(no context available yet — add memory, index docs, or record session turns)';
  }
}

/** Naive paragraph/size-based chunker for RAG. */
function chunkText(text: string, maxChars = 1200): string[] {
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let buf = '';
  for (const p of paras) {
    if ((buf + '\n\n' + p).length > maxChars && buf) {
      chunks.push(buf);
      buf = p;
    } else {
      buf = buf ? buf + '\n\n' + p : p;
    }
  }
  if (buf) chunks.push(buf);
  return chunks.length ? chunks : [text.slice(0, maxChars)];
}
