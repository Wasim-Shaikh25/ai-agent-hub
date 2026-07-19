# Roadmap & Build Status

> Status: **living doc** · Update the Status column as we ship.

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
| 3.1 | RBAC enforcement on all routes + MCP tools | ⬜ todo |
| 3.2 | Audit log | ⬜ todo |
| 3.3 | Cost dashboards + budgets | ⬜ todo |
| 3.4 | SSO (WorkOS), RLS multi-tenant isolation | ⬜ todo |
| 3.5 | Stripe metered billing | ⬜ todo |

## Phase 4 — Clients & registry
| # | Item | Status |
|---|---|---|
| 4.1 | Extract extension core → shared package | ⬜ todo |
| 4.2 | Extension: login + write native MCP config to agents | ⬜ todo |
| 4.3 | CLI daemon for non-VS-Code agents | ⬜ todo |
| 4.4 | Downstream MCP server proxying (aggregator) | ⬜ todo |
| 4.5 | Org content registry with versioning/approvals | ⬜ todo |
