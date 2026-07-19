import { config } from '../config.js';

/**
 * Produces an embedding vector for the given text.
 *
 * Two providers:
 * - "local": a deterministic hashed bag-of-words embedding. No API key
 *   required — lets memory + RAG work fully offline for local dev/demo.
 * - "litellm": calls the gateway's OpenAI-compatible /embeddings endpoint.
 */
export async function embed(text: string): Promise<number[]> {
  if (config.embeddingsProvider === 'litellm') {
    return embedViaLiteLLM(text);
  }
  return localEmbed(text);
}

/** Formats a number[] as a pgvector literal, e.g. "[0.1,0.2,...]". */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(',')}]`;
}

/**
 * Deterministic offline embedding: hash each token into the vector space
 * and L2-normalise. Purely lexical, but good enough for local demos and
 * keeps the same dimension as the real provider so schemas don't change.
 */
function localEmbed(text: string): number[] {
  const dim = config.embeddingDim;
  const vec = new Array<number>(dim).fill(0);
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  for (const tok of tokens) {
    const h = hashString(tok);
    const idx = h % dim;
    vec[idx] = (vec[idx] ?? 0) + 1;
    // spread a little signal to a second bucket to reduce collisions
    const idx2 = (h >>> 8) % dim;
    vec[idx2] = (vec[idx2] ?? 0) + 0.5;
  }
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return vec.map((v) => v / norm);
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface EmbeddingsResponse {
  data?: Array<{ embedding?: number[] }>;
}

async function embedViaLiteLLM(text: string): Promise<number[]> {
  const res = await fetch(`${config.litellmUrl}/v1/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
  });
  if (!res.ok) {
    throw new Error(`embeddings failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as EmbeddingsResponse;
  const embedding = json.data?.[0]?.embedding;
  if (!embedding) throw new Error('embeddings response missing data');
  return embedding;
}
