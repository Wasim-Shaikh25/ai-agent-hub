import { query, queryOne } from '../db/pool.js';
import { embed, toVectorLiteral } from '../util/embeddings.js';
import { ContentService } from './contentService.js';
import { config } from '../config.js';
import { redact } from '../privacy/redact.js';

/** Applies PII/secret redaction when enabled, else returns text unchanged. */
function clean(text: string): string {
  return config.redactionEnabled ? redact(text).text : text;
}

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
  path?: string;
  symbol?: string;
  signals?: { denseRank?: number; sparseRank?: number; lexMatches?: number };
}

export type RagMode = 'hybrid' | 'dense' | 'sparse';

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

  async writeMemory(orgId: string, input: { kind?: string; content: string; project?: string; source?: string; visibility?: string; authorId?: string }): Promise<string> {
    const projectId = input.project ? await this.ensureProject(orgId, input.project) : null;
    const content = clean(input.content);
    const vec = toVectorLiteral(await embed(content));
    const visibility = input.visibility ?? config.defaultVisibility;
    const row = await queryOne<{ id: string }>(
      `INSERT INTO memory (org_id, project_id, kind, content, embedding, source, visibility, author_id)
       VALUES ($1,$2,$3,$4,$5::vector,$6,$7,$8) RETURNING id`,
      [orgId, projectId, input.kind ?? 'fact', content, vec, input.source ?? '', visibility, input.authorId ?? null],
    );
    return row!.id;
  }

  /**
   * Semantic memory search, honouring visibility: `org` memory is always
   * visible; `project` memory only within its project; `private` memory only to
   * its author.
   */
  async searchMemory(orgId: string, queryText: string, opts: { project?: string; k?: number; authorId?: string } = {}): Promise<MemoryHit[]> {
    const k = Math.min(Math.max(opts.k ?? 5, 1), 50);
    const vec = toVectorLiteral(await embed(queryText));
    const projectId = opts.project ? await this.ensureProject(orgId, opts.project) : null;
    const rows = await query<{ id: string; kind: string; content: string; distance: number }>(
      `SELECT id, kind, content, (embedding <=> $2::vector) AS distance
         FROM memory
        WHERE org_id = $1
          AND embedding IS NOT NULL
          AND (
            visibility = 'org'
            OR (visibility = 'project' AND ($3::uuid IS NULL OR project_id = $3::uuid OR project_id IS NULL))
            OR (visibility = 'private' AND author_id = $5::uuid)
          )
        ORDER BY embedding <=> $2::vector
        LIMIT $4`,
      [orgId, vec, projectId, k, opts.authorId ?? null],
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
      [sessionId, input.role, input.agent ?? '', clean(input.content)],
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

  async indexDocument(orgId: string, input: { project: string; uri: string; title?: string; content: string; path?: string; language?: string; kind?: string }): Promise<{ documentId: string; chunks: number }> {
    const projectId = await this.ensureProject(orgId, input.project);
    const path = input.path ?? input.uri;
    const language = input.language ?? languageFromPath(path);
    const kind = input.kind ?? detectKind(path, language);
    const cleaned = clean(input.content);
    const summary = summarize(cleaned);
    const doc = await queryOne<{ id: string }>(
      `INSERT INTO document (org_id, project_id, uri, title, summary, kind) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [orgId, projectId, input.uri, input.title ?? input.uri, summary, kind],
    );
    const pieces = chunkCode(cleaned, language);
    let ord = 0;
    for (const p of pieces) {
      const vec = toVectorLiteral(await embed(p.content));
      await query(
        `INSERT INTO chunk (document_id, ord, content, embedding, path, symbol, language) VALUES ($1,$2,$3,$4::vector,$5,$6,$7)`,
        [doc!.id, ord++, p.content, vec, path, p.symbol, language],
      );
    }
    return { documentId: doc!.id, chunks: pieces.length };
  }

  /**
   * Hybrid retrieval: fuse dense (pgvector) and sparse (Postgres FTS) rankings
   * with Reciprocal Rank Fusion, then lexically rerank so exact-identifier
   * matches (function/API names) surface — the accuracy win pure vector search
   * misses on code.
   */
  async ragQuery(orgId: string, project: string, queryText: string, k = 5, mode: RagMode = 'hybrid', uri?: string): Promise<RagHit[]> {
    const projectId = await this.ensureProject(orgId, project);
    const uriFilter = uri ?? null; // when set, scope retrieval to one doc (drill-in)
    const CAND = 30;
    const RRF_K = 60;

    type Row = { id: string; uri: string; content: string; path: string; symbol: string };
    const fused = new Map<string, RagHit & { rrf: number }>();
    const add = (rows: Row[], listKey: 'denseRank' | 'sparseRank') => {
      rows.forEach((r, i) => {
        const rank = i + 1;
        const existing = fused.get(r.id);
        const contribution = 1 / (RRF_K + rank);
        if (existing) {
          existing.rrf += contribution;
          existing.signals![listKey] = rank;
        } else {
          fused.set(r.id, {
            uri: r.uri, content: r.content, path: r.path, symbol: r.symbol,
            score: 0, rrf: contribution, signals: { [listKey]: rank },
          });
        }
      });
    };

    if (mode !== 'sparse') {
      const vec = toVectorLiteral(await embed(queryText));
      const dense = await query<Row>(
        `SELECT c.id, d.uri, c.content, c.path, c.symbol
           FROM chunk c JOIN document d ON d.id = c.document_id
          WHERE d.org_id=$1 AND d.project_id=$2 AND c.embedding IS NOT NULL
            AND ($4::text IS NULL OR d.uri = $4)
          ORDER BY c.embedding <=> $3::vector LIMIT ${CAND}`,
        [orgId, projectId, vec, uriFilter],
      );
      add(dense, 'denseRank');
    }
    if (mode !== 'dense') {
      const sparse = await query<Row>(
        `SELECT c.id, d.uri, c.content, c.path, c.symbol, ts_rank_cd(c.ts, q) AS r
           FROM chunk c JOIN document d ON d.id = c.document_id,
                websearch_to_tsquery('simple', $3) q
          WHERE d.org_id=$1 AND d.project_id=$2 AND c.ts @@ q
            AND ($4::text IS NULL OR d.uri = $4)
          ORDER BY r DESC LIMIT ${CAND}`,
        [orgId, projectId, queryText, uriFilter],
      );
      add(sparse, 'sparseRank');
    }

    // Lexical rerank: boost chunks containing the query's exact identifier tokens.
    const qTokens = identifierTokens(queryText);
    const results = [...fused.values()].map((h) => {
      const hay = new Set(identifierTokens(h.content));
      const lexMatches = qTokens.filter((t) => hay.has(t)).length;
      h.signals!.lexMatches = lexMatches;
      h.score = h.rrf + lexMatches * 0.02; // small, deterministic boost
      return h;
    });
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, Math.min(Math.max(k, 1), 50)).map(({ rrf, ...h }) => ({ ...h, score: Number(h.score.toFixed(4)) }));
  }

  /**
   * The knowledge map: a compact index of indexed docs/specs (title, summary,
   * sections, keywords) an agent reads FIRST to navigate to the right knowledge
   * before drilling in with `ragQuery`. Two-stage retrieval.
   */
  async knowledgeMap(orgId: string, project?: string): Promise<Array<{ uri: string; title: string; kind: string; summary: string; sections: string[]; keywords: string[] }>> {
    const projectId = project ? await this.ensureProject(orgId, project) : null;
    const docs = await query<{ id: string; uri: string; title: string; kind: string; summary: string }>(
      `SELECT id, uri, title, kind, summary FROM document
        WHERE org_id = $1 AND ($2::uuid IS NULL OR project_id = $2::uuid)
        ORDER BY kind, uri`,
      [orgId, projectId],
    );
    const out = [];
    for (const d of docs) {
      const chunks = await query<{ symbol: string; content: string }>(
        `SELECT symbol, content FROM chunk WHERE document_id = $1 ORDER BY ord`,
        [d.id],
      );
      const sections = chunks.map((c) => c.symbol).filter((s) => s && s !== '(module)' && s !== '(intro)');
      out.push({
        uri: d.uri, title: d.title, kind: d.kind, summary: d.summary,
        sections: [...new Set(sections)].slice(0, 25),
        keywords: topKeywords(chunks.map((c) => c.content).join('\n'), 10),
      });
    }
    return out;
  }

  // -- context assembler ----------------------------------------------------

  /**
   * Builds the minimal-correct context for a request: active rules/skills +
   * rolling session summary + recent turns + top-k RAG + relevant memory,
   * trimmed to a rough token budget (~4 chars/token).
   */
  async assembleContext(orgId: string, input: { project: string; key: string; query?: string; maxTokens?: number; authorId?: string }): Promise<string> {
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
      const mem = await this.searchMemory(orgId, q, { project: input.project, k: 5, authorId: input.authorId });
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

interface CodePiece { content: string; symbol: string; }

/** Classifies a document as spec / code / doc for the knowledge map. */
function detectKind(path: string, language: string): string {
  if (language !== 'markdown' && language !== 'text') return 'code';
  return /spec|specs|rfc|design|adr/i.test(path) ? 'spec' : 'doc';
}

/** A short summary: first meaningful paragraph, stripped of markup. */
function summarize(content: string, maxChars = 240): string {
  const lines = content.split('\n');
  const buf: string[] = [];
  for (const raw of lines) {
    const line = raw.replace(/^#+\s*/, '').replace(/^>\s*/, '').replace(/^\s*[-*]\s+/, '').trim();
    if (!line || line.startsWith('```') || /^[|+-]{3,}/.test(line)) continue;
    buf.push(line);
    if (buf.join(' ').length >= maxChars) break;
  }
  const s = buf.join(' ');
  return s.length > maxChars ? s.slice(0, maxChars).trimEnd() + '…' : s;
}

/** Most frequent identifier tokens in a document, for map keywords. */
function topKeywords(content: string, n: number): string[] {
  const stop = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'not', 'you', 'use', 'can', 'via', 'per', 'into', 'each', 'when', 'org', 'set']);
  const counts = new Map<string, number>();
  for (const tok of identifierTokens(content)) {
    if (tok.length < 4 || stop.has(tok) || /^\d+$/.test(tok)) continue;
    counts.set(tok, (counts.get(tok) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([t]) => t);
}

/** Splits markdown by headings so each section becomes a citeable chunk. */
function chunkMarkdown(content: string): CodePiece[] {
  const lines = content.split('\n');
  const pieces: CodePiece[] = [];
  let heading = '(intro)';
  let buf: string[] = [];
  const flush = () => {
    const body = buf.join('\n').trim();
    if (body) pieces.push({ content: heading !== '(intro)' ? `## ${heading}\n${body}` : body, symbol: heading });
    buf = [];
  };
  for (const line of lines) {
    const m = /^#{1,6}\s+(.*)$/.exec(line);
    if (m) { flush(); heading = m[1]!.trim(); } else buf.push(line);
  }
  flush();
  return pieces.length ? pieces : [{ content, symbol: '' }];
}

/** Maps a file path to a coarse language name. */
function languageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', mjs: 'javascript',
    py: 'python', go: 'go', java: 'java', rb: 'ruby', rs: 'rust', cs: 'csharp', php: 'php',
    md: 'markdown', markdown: 'markdown', txt: 'text',
  };
  return map[ext] ?? 'text';
}

/** Top-level definition regex per language (named group `name`), or null. */
function defRegexFor(language: string): RegExp | null {
  switch (language) {
    case 'typescript':
    case 'javascript':
      return /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let|var|interface|type|enum)\s+(?<name>[A-Za-z_$][\w$]*)/;
    case 'python':
      return /^(?:async\s+)?(?:def|class)\s+(?<name>[A-Za-z_]\w*)/;
    case 'go':
      return /^func\s+(?:\([^)]*\)\s*)?(?<name>[A-Za-z_]\w*)/;
    default:
      return null;
  }
}

/**
 * Code-aware chunker: splits source at top-level symbol boundaries so each
 * chunk is a coherent function/class the agent can cite as `path:symbol`.
 * Prose or unsupported languages fall back to paragraph chunking.
 */
function chunkCode(content: string, language: string): CodePiece[] {
  if (language === 'markdown') return chunkMarkdown(content);
  const re = defRegexFor(language);
  if (!re) return chunkText(content).map((c) => ({ content: c, symbol: '' }));

  const lines = content.split('\n');
  const starts: Array<{ line: number; symbol: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i] ?? '');
    if (m) starts.push({ line: i, symbol: m.groups?.name ?? '' });
  }
  if (starts.length === 0) return chunkText(content).map((c) => ({ content: c, symbol: '' }));

  const pieces: CodePiece[] = [];
  if (starts[0]!.line > 0) {
    const pre = lines.slice(0, starts[0]!.line).join('\n').trim();
    if (pre) pieces.push({ content: pre, symbol: '(module)' });
  }
  for (let s = 0; s < starts.length; s++) {
    const from = starts[s]!.line;
    const to = s + 1 < starts.length ? starts[s + 1]!.line : lines.length;
    let body = lines.slice(from, to).join('\n');
    if (body.length > 2000) body = body.slice(0, 2000) + '\n… (truncated)';
    pieces.push({ content: body, symbol: starts[s]!.symbol });
  }
  return pieces;
}

function splitCamel(s: string): string[] {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/\s+/).filter(Boolean);
}

/** Identifier tokens (camel/snake split + whole word), for lexical reranking. */
function identifierTokens(text: string): string[] {
  const raw = text.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? [];
  const out = new Set<string>();
  for (const w of raw) {
    for (const part of w.split(/_+/).flatMap(splitCamel)) {
      const t = part.toLowerCase();
      if (t.length >= 2) out.add(t);
    }
    if (w.length >= 3) out.add(w.toLowerCase());
  }
  return [...out];
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
