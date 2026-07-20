# Semantic Cache Spec

> Status: **draft v1**

## 1. Goal

Cut token spend and latency by returning a cached completion when a new request
is semantically close to a previous one.

## 2. How it works

- On a non-streaming gateway request, embed the final user message.
- Look up the org's `cache_entry` rows by vector similarity (pgvector) within a
  configurable distance threshold; scope by `(org, model)`.
- **Hit** → return the stored completion, tagged `x-hub-cache: hit`, and record a
  `usage_event` with `cached: true` and `usd: 0` (savings tracked).
- **Miss** → forward as normal, then store `{ prompt_embedding, response,
  model }` for future hits.

## 3. Config & policy

| Var | Default | Meaning |
|---|---|---|
| `CACHE_ENABLED` | `false` | master switch (opt-in) |
| `CACHE_THRESHOLD` | `0.05` | max cosine distance for a hit |
| `CACHE_TTL_DAYS` | `7` | entry lifetime |

Per-org `{ kind: "cache", spec: { threshold, ttlDays, enabled } }` overrides.
Streaming requests bypass the cache (Phase 2 scope).

## 4. Data model

`cache_entry(id, org_id, model, prompt, embedding vector(1536), response jsonb,
hits int, created_at)` with an hnsw index. Respects data-residency scope.

## 5. Verification

Offline (local embeddings): send the same question twice → 2nd returns
`x-hub-cache: hit` with identical content and `usd: 0`; a clearly different
question → `miss`. Report savings via metrics (spec 10).
