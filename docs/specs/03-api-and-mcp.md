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

Agents point their base URL at the Hub (`http://<hub>/v1`) and authenticate with
their Hub API key. The Hub proxies to LiteLLM and layers on policy routing,
fallback, budgets, and metering. (In self-host you may point agents straight at
LiteLLM to skip the hop; you then lose Hub-level governance.)

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/chat/completions` | OpenAI-compatible proxy (Cursor, Cline, Codex, …) |
| POST | `/v1/messages` | Anthropic-compatible proxy (Claude Code) |
| GET | `/api/policies?kind=` | list routing/model/budget policies |
| POST | `/api/policies` | create a policy |
| DELETE | `/api/policies/:id` | delete a policy |
| GET | `/api/usage` | current-month token usage, USD cost + active budget |

### Inbound formats

The gateway accepts two request shapes so nearly any agent works:
- **OpenAI** (`/v1/chat/completions`) — point the agent's OpenAI base URL at
  `http://<hub>/v1`.
- **Anthropic** (`/v1/messages`) — point Claude Code's `ANTHROPIC_BASE_URL` at
  `http://<hub>`.

Both share the same routing/fallback/budget engine. Outbound, LiteLLM reaches
60+ providers regardless of which inbound format was used.

### Request headers

- `Authorization: Bearer <hub-api-key>` (required)
- `x-hub-task: <task>` (optional) — selects a model via a `routing` policy,
  e.g. `refactor` → a frontier model, `boilerplate` → a cheap model.

### Response headers

- `x-hub-model` — the model that actually served the request.
- `x-hub-tried` — the chain that was attempted (shows where fallback kicked in).

### Model chain resolution

`[ routing(task) || requested-model || default_chain[0] , ...fallbacks || default_chain ]`

The chain is walked in order; a retryable upstream status (408, 409, 425, 429,
5xx) or a network error advances to the next model. Non-retryable errors (e.g.
400) are returned to the caller as-is.

### Metering & budgets

- Non-streaming: `usage.total_tokens` is read from the response.
- Streaming: the Hub injects `stream_options.include_usage` and parses the final
  SSE chunk's `total_tokens`.
- Each call writes a `usage_event (kind='tokens')` with `{model, input, output,
  usd}` in `meta`. USD cost is computed from `server/src/gateway/pricing.ts`.
- If an active `budget` policy sets `maxTokens` or `maxUsd` and the month's usage
  meets/exceeds it, the request is rejected with `429 budget_exceeded` before any
  provider is called.

### Policy spec shapes

```jsonc
// routing — one row per task
{ "kind": "routing", "spec": { "task": "refactor", "model": "claude-sonnet" } }

// model — fallbacks for a primary, and/or an org-wide default chain
{ "kind": "model", "spec": { "model": "claude-sonnet", "fallbacks": ["gpt-4o-mini"] } }
{ "kind": "model", "spec": { "default_chain": ["gpt-4o-mini", "claude-sonnet"] } }

// budget — monthly ceiling
{ "kind": "budget", "spec": { "period": "month", "maxTokens": 5000000 } }
```

Provider/model definitions and LiteLLM-native fallbacks live in
`deploy/litellm.config.yaml`.

## 5. Error model

JSON: `{ error: { code, message } }`. MCP tools return `isError: true` with a
text content block on failure. Never leak provider keys or other orgs' data.
