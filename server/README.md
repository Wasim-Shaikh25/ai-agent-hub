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

Health, API-key auth (+401), memory write/semantic-search, cross-agent shared
sessions, RAG index/query, the context assembler, and the MCP
`initialize` / `tools/list` / `tools/call` lifecycle all run green against
Postgres + pgvector.
