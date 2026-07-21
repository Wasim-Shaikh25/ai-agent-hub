# Code-Aware Hybrid RAG Spec

> Status: **draft v1**. Adapts the Advanced RAG guide to the *coding agent* use
> case: make retrieved context easier and more accurate for an agent to write
> code with. Scope pulled from the guide §5.1–5.3, §7; multimodal/RL/graph
> deferred as off the critical path for code.

## 1. Why hybrid (not just vector)

Code retrieval fails on pure dense search: exact identifiers (`getUserById`,
error codes, flag names, API paths) need **lexical/BM25** matching, while
"how does auth work" needs **semantic** matching. We combine both.

## 2. Pipeline

```
ingest → code-aware chunk → index (dense + sparse) → hybrid retrieve
       → rerank → context-engine (dedup + compress + budget) → agent
```

### 2.1 Code-aware chunking
Split source by top-level symbol boundaries (function/class/method) using
lightweight per-language heuristics, not fixed-size windows. Each chunk keeps
`{ path, symbol, language }` so retrieval can cite `file:symbol`. Prose/markdown
falls back to paragraph chunking.

### 2.2 Dual index
Each chunk stores:
- `embedding vector(1536)` — dense (pgvector, cosine).
- `ts tsvector` — sparse (Postgres full-text, `simple` config, no stemming so
  identifiers stay intact) with a GIN index.

### 2.3 Hybrid retrieval — Reciprocal Rank Fusion
Retrieve top-N from each index independently, then fuse by RRF:
`score(d) = Σ 1 / (k + rank_list(d))`, `k = 60`. RRF needs no score
normalization and is robust across signals.

### 2.4 Rerank
Heuristic rerank over the fused top set: boost chunks that contain the query's
exact identifier tokens (camel/snake-case aware) and same-path matches. An
optional LLM reranker (via the gateway) can score high-value queries later
(the guide's cross-encoder, without a Python/torch dependency).

### 2.5 Context engine
Before returning: **dedupe** near-identical chunks, **compress** to a token
budget (keep highest-ranked whole; trim the tail), and cite `path:symbol`.

## 3. API

`rag_query` (MCP) and `GET /api/rag/query` gain a `mode` (`hybrid` default,
`dense`, `sparse`) and return `{ path, symbol, content, score, signals }`.

## 4. Evaluation (Tier 2)

`GET /api/rag/eval` runs a small labeled set and reports recall@k, MRR, and
context efficiency so retrieval changes are measurable.

## 5. Verification

Index a code file with several functions. A query for an exact symbol name
returns that function's chunk at rank 1 via the sparse signal even when the
dense signal is weak; a conceptual query is served by the dense signal; hybrid
beats either alone.
