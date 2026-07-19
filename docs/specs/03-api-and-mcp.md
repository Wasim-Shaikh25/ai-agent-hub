# API & MCP Contract Spec

> Status: **draft v1**

Two surfaces: a **REST API** (management/UI) and an **MCP server** (what agents
actually call at runtime).

## 1. Auth

All requests: `Authorization: Bearer <api-key>`. Key → `{org, user, roles}`.
In local dev a seed key is printed on first boot (`DEV_API_KEY`).

## 2. REST API (management)

Base: `/api`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | liveness (no auth) |
| GET | `/api/me` | resolve current org/user |
| GET | `/api/content?type=skill` | list content items |
| POST | `/api/content` | create content item |
| PUT | `/api/content/:id` | update content item |
| DELETE | `/api/content/:id` | delete content item |
| GET | `/api/sessions/:project/:key` | fetch session + recent turns |
| POST | `/api/sessions/:project/:key/turns` | append a turn |
| GET | `/api/memory?q=...` | semantic memory search |
| POST | `/api/memory` | write a memory |
| POST | `/api/rag/index` | index a document for a project |
| GET | `/api/rag/query?project=...&q=...` | RAG query |
| GET | `/api/mcp-config?agent=cursor` | native MCP config snippet for an agent |

## 3. MCP server (runtime, what agents call)

Endpoint: `POST /mcp` (Streamable HTTP, JSON-RPC 2.0) + `GET /mcp` (SSE).
Implemented with `@modelcontextprotocol/sdk`. Tools:

### `session_get_context`
Assembled, token-budgeted context for the current work.
Input: `{ project: string, key: string, query?: string, maxTokens?: number }`
Output: text = active rules/skills + rolling summary + top-k RAG + relevant
memory, deduped and trimmed to budget.

### `session_append`
Record a turn so other agents see it.
Input: `{ project, key, role, content, agent? }` → `{ ok, turnId }`.

### `memory_write`
Input: `{ kind: "fact"|"decision"|"preference", content, project? }` → `{ id }`.

### `memory_search`
Input: `{ query, project?, k?: number }` → `{ results: [{content, score}] }`.

### `rag_query`
Input: `{ project, query, k?: number }` → `{ chunks: [{uri, content, score}] }`.

### `skills_list`
Input: `{ type?: "skill"|"rule"|... }` → enabled content items for the org.

Downstream MCP servers registered in the org are **proxied**: their
`tools/list` and `tools/call` are merged into this endpoint (namespaced
`<server>__<tool>`).

## 4. Gateway (inference path)

LiteLLM exposes an OpenAI-compatible endpoint. Agents point their base URL at
`http://<hub>/v1` (or directly at LiteLLM in self-host). The Hub adds:
- fallback chains (primary → cheaper → free),
- per-org/task model routing (from `policy`),
- usage metering + audit.

Config example lives in `deploy/litellm.config.yaml`.

## 5. Error model

JSON: `{ error: { code, message } }`. MCP tools return `isError: true` with a
text content block on failure. Never leak provider keys or other orgs' data.
