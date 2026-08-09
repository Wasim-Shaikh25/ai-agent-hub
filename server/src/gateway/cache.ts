import { query, queryOne } from '../db/pool.js';
import { config } from '../config.js';
import { embed, toVectorLiteral } from '../util/embeddings.js';
import type { ChatBody } from './gatewayService.js';

/**
 * Semantic response cache. On a non-streaming request, a prompt close to a prior
 * one (by embedding cosine distance) returns the stored completion — saving
 * tokens and latency. Opt-in via CACHE_ENABLED.
 */
export class SemanticCache {
  get enabled(): boolean {
    return config.cacheEnabled;
  }

  /** Returns a cached response if one is within the distance threshold. */
  async lookup(orgId: string, model: string, promptText: string): Promise<unknown | undefined> {
    if (!promptText) return undefined;
    const vec = toVectorLiteral(await embed(promptText));
    const row = await queryOne<{ id: string; response: unknown; distance: number }>(
      `SELECT id, response, (embedding <=> $3::vector) AS distance
         FROM cache_entry
        WHERE org_id = $1 AND model = $2
          AND created_at > now() - ($4 || ' days')::interval
        ORDER BY embedding <=> $3::vector
        LIMIT 1`,
      [orgId, model, vec, String(config.cacheTtlDays)],
    );
    if (!row || Number(row.distance) > config.cacheThreshold) return undefined;
    void query('UPDATE cache_entry SET hits = hits + 1 WHERE id = $1', [row.id]);
    return row.response;
  }

  /** Stores a completion for future semantic hits. */
  async store(orgId: string, model: string, promptText: string, response: unknown): Promise<void> {
    if (!promptText) return;
    const vec = toVectorLiteral(await embed(promptText));
    await query(
      `INSERT INTO cache_entry (org_id, model, prompt, embedding, response) VALUES ($1,$2,$3,$4::vector,$5)`,
      [orgId, model, promptText.slice(0, 4000), vec, JSON.stringify(response)],
    );
  }
}

/** Extracts the salient prompt text (last user message) from a request body. */
export function extractPrompt(body: ChatBody): string {
  const messages = body['messages'];
  if (!Array.isArray(messages)) return '';
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { role?: string; content?: unknown };
    if (m.role !== 'user') continue;
    if (typeof m.content === 'string') return m.content;
    if (Array.isArray(m.content)) {
      return (m.content as Array<{ type?: string; text?: string }>)
        .filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('\n');
    }
  }
  return '';
}

export const semanticCache = new SemanticCache();
