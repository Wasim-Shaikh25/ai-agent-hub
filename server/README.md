# hub-server

The AI Agent Hub server — **Context Plane** (shared sessions, memory, RAG),
a **native MCP** endpoint any agent can connect to, and hooks for the
**Gateway Plane** (LiteLLM). See [`../docs/specs/`](../docs/specs/) for the full
design.

## Quick start (with the full local stack)

```bash
cd ../deploy
cp .env.example .env
docker compose up --build
```

Full instructions: [`../docs/specs/04-local-dev.md`](../docs/specs/04-local-dev.md).

## Run just the server (against external Postgres/Redis)

```bash
npm install
cp .env.example .env      # point DATABASE_URL at your Postgres (pgvector)
npm run migrate           # apply schema + seed a dev API key
npm run dev               # tsx watch on :8080
```

Postgres must have the `vector` and `pgcrypto` extensions available
(the `pgvector/pgvector` image ships them; for a native install the extension
must be created by a superuser once).

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | watch-mode server (tsx) |
| `npm run build` | compile to `dist/` |
| `npm start` | run compiled server |
| `npm run migrate` | apply migrations + dev seed |
| `npm run typecheck` | `tsc --noEmit` |

## Endpoints

- REST management API under `/api` (see
  [`../docs/specs/03-api-and-mcp.md`](../docs/specs/03-api-and-mcp.md)).
- Native MCP at `POST /mcp` (Streamable HTTP, JSON-RPC 2.0).
- `GET /health` for liveness.

## Verified end-to-end

Against Postgres + pgvector, all green:

- **Context Plane:** health, API-key auth (+401), memory write/semantic-search,
  cross-agent shared sessions, RAG index/query, context assembler, and the MCP
  `initialize` / `tools/list` / `tools/call` lifecycle.
- **Gateway Plane:** OpenAI (`/v1/chat/completions`) **and** Anthropic
  (`/v1/messages`, for Claude Code) proxies with policy-based model chains,
  automatic fallback on retryable upstream errors (verified via a forced 429),
  task→model routing (`x-hub-task`), streaming passthrough, precise token + USD
  cost metering (non-stream + streaming, both formats), and token/USD
  `429 budget_exceeded` enforcement.
- **Governance:** role-based access (viewer/member/admin/owner) enforced on REST
  routes and MCP tools (viewers get read-only tools), append-only audit log,
  API-key management with per-key role override, and a per-model cost breakdown.
- **MCP aggregation:** register downstream MCP servers and the Hub re-exposes
  their tools namespaced `<server>__<tool>` through its single endpoint
  (verified: a demo server's tools listed + called through the Hub).
- **Content registry:** version history + optional approval workflow — non-admin
  edits stage as `pending` and stay invisible to agents until an admin approves
  (verified end-to-end).
