# Roadmap & Build Status

> Status: **living doc** · Update the Status column as we ship.

**Summary:** Phases 0–4 are complete. Server-side features were verified
end-to-end against Postgres+pgvector (and mock upstreams for the gateway/Stripe).
Two items carry honest caveats: **SSO/Stripe** are wired + gated and verified on
every path that doesn't require a live third-party account (dev SSO provider,
webhook-signature crypto, disabled paths); the **VS Code extension** Hub client
compiles and mirrors the runtime-verified CLI flow, but exercising it in an
Extension Host is left to a machine with VS Code. RLS ships enabled but
non-breaking; making isolation mandatory (drop the null-escape + non-owner role)
is a one-line hardening when desired.

## Phase 0 — Foundations & local stack
| # | Item | Status |
|---|---|---|
| 0.1 | Specs (this folder) | ✅ done |
| 0.2 | Monorepo-ish layout: `server/` + `deploy/` alongside existing extension | ✅ done |
| 0.3 | docker-compose: Postgres+pgvector, Redis, LiteLLM, hub-server | ✅ done |
| 0.4 | Fastify server boots, `/health`, migrations run, dev API key seeded | ✅ done |

## Phase 1 — Context Plane MVP (the differentiator)
| # | Item | Status |
|---|---|---|
| 1.1 | Postgres schema (orgs/sessions/turns/memory/docs/content/usage) | ✅ done |
| 1.2 | Auth: API key → org/user; RBAC scaffold | ✅ done |
| 1.3 | Memory: write + semantic search (pgvector, offline embeddings) | ✅ done |
| 1.4 | Sessions: append turn + fetch context (shared across agents) | ✅ done |
| 1.5 | RAG: index document + query | ✅ done |
| 1.6 | Context assembler (rules/skills + RAG + memory, token-budgeted) | ✅ done |
| 1.7 | **Native MCP server** exposing the above as tools | ✅ done |
| 1.8 | `mcp-config` endpoint: emit native config per agent | ✅ done |

## Phase 2 — Gateway Plane
| # | Item | Status |
|---|---|---|
| 2.1 | LiteLLM wired in compose with example providers | ✅ done |
| 2.2 | Fallback chains + task→model routing from `policy` | ✅ done |
| 2.3 | Usage metering on inference (non-stream + streaming) | ✅ done |
| 2.4 | Budget enforcement (`429 budget_exceeded`) | ✅ done |
| 2.5 | Embeddings via LiteLLM (flip `EMBEDDINGS_PROVIDER`) | ✅ done |
| 2.6 | Anthropic `/v1/messages` compatibility (for Claude Code base URL) | ✅ done |
| 2.7 | Cost (USD) metering + per-model pricing table | ✅ done |

## Phase 3 — Governance & Enterprise
| # | Item | Status |
|---|---|---|
| 3.1 | RBAC enforcement on routes + MCP tools (viewer/member/admin/owner) | ✅ done |
| 3.2 | Audit log (+ `/api/audit`) | ✅ done |
| 3.3 | Cost dashboard (`/api/usage/breakdown`) + token/USD budgets | ✅ done |
| 3.4 | API-key management (`/api/keys`, per-key role override) | ✅ done |
| 3.5 | SSO (dev + WorkOS) + JWT sessions + RLS isolation | ✅ done (WorkOS provider drop-in; verified with dev provider) |
| 3.6 | Stripe metered billing (meter events, checkout, signed webhook) | ✅ done (wired + gated; add STRIPE_SECRET_KEY to activate) |

## Phase 4 — Clients & registry
| # | Item | Status |
|---|---|---|
| 4.1 | Single source of truth for config (server API; no client duplication) | ✅ done |
| 4.2 | Extension: connect to server + write native MCP config to agents | ✅ done (compiles; runtime needs a VS Code host) |
| 4.3 | CLI connector (`aihub`) for any agent incl. non-VS-Code | ✅ done |
| 4.4 | Downstream MCP server proxying (aggregator) | ✅ done |
| 4.5 | Org content registry with versioning/approvals | ✅ done |
