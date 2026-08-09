import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from '../config.js';

const here = dirname(fileURLToPath(import.meta.url));

// Candidate locations for the LiteLLM config, relative to the built server.
const CANDIDATES = [
  join(here, '../../../deploy/litellm.config.yaml'),
  join(here, '../../deploy/litellm.config.yaml'),
  join(process.cwd(), 'deploy/litellm.config.yaml'),
];

/** True for models we don't offer as chat targets (embeddings, rerankers). */
function isChatModel(id: string): boolean {
  return !/embedding|rerank|moderation|whisper|tts|dall-?e/i.test(id);
}

let cache: { ids: string[]; ts: number } | undefined;
const TTL = 60_000;

/**
 * The chat-model catalog. Priority: `HUB_MODELS` env (comma list) → the
 * LiteLLM config's `model_name:` entries → a small built-in default. Cached 60s.
 */
export function listModels(): string[] {
  if (cache && Date.now() - cache.ts < TTL) return cache.ids;
  let ids = fromEnv() ?? fromConfigFile() ?? ['gpt-4o-mini', 'claude-sonnet'];
  ids = [...new Set(ids.filter(isChatModel))];
  cache = { ids, ts: Date.now() };
  return ids;
}

function fromEnv(): string[] | undefined {
  const raw = (config.models ?? '').trim();
  if (!raw) return undefined;
  const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return ids.length ? ids : undefined;
}

function fromConfigFile(): string[] | undefined {
  for (const path of CANDIDATES) {
    try {
      const text = readFileSync(path, 'utf-8');
      const ids: string[] = [];
      for (const line of text.split('\n')) {
        const m = /^\s*-?\s*model_name:\s*["']?([^"'#\n]+?)["']?\s*$/.exec(line);
        if (m?.[1]) ids.push(m[1].trim());
      }
      if (ids.length) return ids;
    } catch {
      /* try the next candidate */
    }
  }
  return undefined;
}

/** OpenAI-standard `/v1/models` payload. */
export function modelsPayload(): { object: 'list'; data: Array<{ id: string; object: 'model'; owned_by: string }> } {
  return { object: 'list', data: listModels().map((id) => ({ id, object: 'model', owned_by: 'ai-agent-hub' })) };
}
