# Architecture Spec

> Status: **draft v1**

## 1. Topology

```
                    ┌──────────── CLIENTS (free, thin) ────────────┐
 Cursor / Kiro /    │  VS Code extension     CLI daemon            │
 Copilot / Windsurf │  (refactored)          (Claude Code, Codex,  │
 / Claude Code      │                         Cline, CI runners)   │
                    └──────┬─────────────────────────┬─────────────┘
                           │ MCP (context/memory/RAG) │ base_url (LLM calls)
        ═══════════════════▼══════════════════════════▼═══════════════════
                     HUB SERVER   (paid · hosted OR self-host in VPC)
        ┌────────────────────────────────────────────────────────────────┐
        │  Auth + Org/Team/RBAC        │  Billing / usage metering        │
        ├────────────────────────────────────────────────────────────────┤
        │  MCP Aggregator (native)  │ Policy/Governance │ Content Registry │
        ├────────────────────────────────────────────────────────────────┤
        │  Context Service:  sessions · memory · RAG · context assembler   │
        ├────────────────────────────────────────────────────────────────┤
        │  LLM Gateway = LiteLLM (sidecar) → fallback · cost · translation  │
        └──────┬──────────────────┬───────────────┬───────────────────────┘
           Postgres+pgvector    Redis         Object store   →  Providers
           (meta/sessions/      (cache/       (files/           (Anthropic,
            vectors)            ratelimit)     artifacts)         OpenAI, …)
```

## 2. Components

### 2.1 API + Auth
- Fastify HTTP server. All requests carry an API key (`Authorization: Bearer`)
  or session token → resolved to `{ org, user, roles }`.
- RBAC enforced at route + MCP-tool level.

### 2.2 MCP Aggregator (native MCP server)
- Uses `@modelcontextprotocol/sdk` with **Streamable HTTP** transport and the
  real `initialize` / session / SSE lifecycle (fixes the old "curl a rule file"
  approach that never worked).
- Exposes Hub context tools **and** proxies downstream MCP servers so an agent
  sees one endpoint = all tools.
- Per-org tool allowlist enforced here.

### 2.3 Context Service (the differentiator)
- **Sessions:** append-only `turns` + rolling `summary`, keyed by
  `(org, project, session)`. Cross-agent because it lives server-side.
- **Memory:** durable facts/decisions with semantic search (pgvector).
- **RAG:** repo + docs chunked → embeddings → pgvector; `rag.query` returns
  top-k. Embeddings computed via the gateway (or a local hash fallback for
  offline dev).
- **Context assembler:** builds minimal-correct context per request = active
  rules/skills + top-k RAG + relevant memory, deduped/compressed. This is our
  semantic "token optimization."

### 2.4 Policy / Governance engine
- Routing rules (task → model), model/provider allowlists, budgets, content
  policy. Enforced at both MCP and gateway layers.

### 2.5 Content Registry
- Versioned skills/rules/hooks/workflows/personas per org. Superset of the
  extension's `hub-content/` model, with approvals.

### 2.6 LLM Gateway = LiteLLM
- Runs as a **separate container** (Python) — never embedded in Node. The Hub
  calls it over HTTP. We own policy/UI; LiteLLM owns provider plumbing +
  fallback chains.

### 2.7 Billing / metering
- Meter MCP calls, tokens, RAG queries → usage events → Stripe (later phase).

## 3. Data stores

| Store | Purpose |
|---|---|
| **Postgres + pgvector** | metadata, orgs, sessions, turns, memory, embeddings, content, usage. One store for relational + vectors → simplest to self-host. |
| **Redis** | cache, rate limits, session hot-state. |
| **Object storage** | large files/artifacts (S3-compatible; local disk in dev). |

## 4. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Server | TypeScript + Fastify | reuse existing extension TS/types |
| MCP | `@modelcontextprotocol/sdk` | official lifecycle handling |
| Gateway | LiteLLM (own container) | don't rebuild commodity routing |
| DB + vectors | Postgres + `pgvector` | one store for meta + embeddings |
| Cache/limits | Redis (`ioredis`) | rate limits, hot session state |
| Validation | `zod` | typed request/tool schemas |
| Auth/SSO | API keys now → WorkOS later | enterprise SSO is table-stakes for paid |
| Billing | Stripe (later) | metered + seats |
| Deploy | Docker Compose (self-host) + Fly/Render/K8s (SaaS) | same images both ways |

## 5. Deployment model

- **One set of Docker images** serves both SaaS and self-host. Enterprise
  self-host = a packaging/config change, not a rewrite.
- Local dev = the same compose stack (Postgres, Redis, LiteLLM, hub-server).
- Data isolation: `org_id` on every row now; schema-per-org or RLS later for
  hard multi-tenant isolation.

## 6. Security invariants

- Inference path is self-hostable → customer code/context need never leave their
  network (enterprise upsell).
- Secrets (provider keys) held in LiteLLM config / env, never in client dotfiles.
- Encrypt at rest; per-tenant scoping on every query.
