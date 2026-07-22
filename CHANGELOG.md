# Changelog

All notable changes to the **Hub server** (the paid, server-side control plane).
Format loosely follows [Keep a Changelog](https://keepachangelog.com/); the
VS Code extension is versioned separately via GitHub Releases (see `README.md`).

## [Unreleased]

### Added — operator control plane

- **Platform super-admin console** (`/superadmin`) — a vendor-only surface,
  gated by `app_user.is_platform_admin`. A normal user, even an org owner,
  gets `403`. Tabs: Overview, Organizations, Issues, Copilot.
  Spec: `docs/specs/16-platform-admin.md`.
- **Cross-org control** — `GET /api/platform/orgs` and
  `PUT /api/platform/orgs/:id` to change any org's **plan**
  (`free|team|enterprise`, cache invalidated on change) or **suspend/resume**
  it. Both actions are audited.
- **Org suspension** — `org.suspended`; a suspended workspace is blocked at
  auth with `403 org_suspended` before any handler runs.
- **Operational issue log** — `system_event` table + `EventService` (best-effort,
  redacted). The gateway and auth layers emit `provider_error`, `gateway_error`,
  `budget_exceeded`, `limit_reached`, `redaction_block`, `slow_request`
  (past `SLOW_REQUEST_MS`), and `org_suspended`.
- **Issue analysis API** — `GET /api/platform/events/summary?hours=` (by level,
  top codes, worst-affected orgs) and `GET /api/platform/events` (filterable +
  JSON export). Surfaced in the Issues tab: severity tiles, code-filter chips,
  color-coded log.
- **Operator copilot** — `POST /api/platform/assistant`, grounded in a live
  platform snapshot that includes the 24h issue summary, so it can answer
  "what is failing?" / "which orgs have the most errors?". Falls back to a
  deterministic snapshot answer when no LLM is reachable (`{ llm: false }`).
- **Feedback labels** — `POST /api/feedback` records 👍/👎 on a completion into
  `training_sample` (redacted); `GET /api/platform/training` lists them.
- **Team management** — `GET /api/members` + `PUT /api/members/:userId` (role
  change with last-owner protection), surfaced in the `/admin` Team tab.

### Changed

- Platform admins are **exempt** from the org-suspension block in `requireAuth`,
  so suspending your own org can't lock you out of the controls that un-suspend
  it. The exemption is narrow (keyed on `is_platform_admin`).
- `training_sample` holds only user feedback + copilot exchanges — the gateway
  no longer harvests prompt/response pairs. Dropped the unused `TRAINING_LOG`
  flag.

### Config

- `SLOW_REQUEST_MS` (default `20000`) — latency threshold for `slow_request`.

### Migrations

- `012_platform.sql` — `app_user.is_platform_admin`, `org.suspended`,
  `training_sample`.
- `013_events.sql` — `system_event` (+ recent/code/org indexes).

---

## Earlier server milestones (pre-changelog)

Delivered before this changelog was started — see git history for detail:

- **Governance** — org admin console (`/admin`), audit log, content approval +
  versioning/rollback, RBAC, SSO (dev + WorkOS), RLS isolation.
- **Open-core entitlements** — free/team/enterprise enforced in code
  (`requireFeature` → 402); plan limits (seats, projects, memory rows, monthly
  requests).
- **Context plane** — shared sessions/turns, external memory with decay, native
  MCP server + downstream aggregation, auto session summarization + memory
  extraction, priority-budget context engine.
- **Code-aware RAG** — hybrid BM25 + dense fusion, knowledge map, diagnostics-
  aware retrieval, optional LLM reranker, eval harness (recall@k / MRR).
- **Gateway** — OpenAI + Anthropic proxies, provider fallback, quality routing,
  semantic cache, budgets, cost metering + dashboard.
- **Privacy** — PII/secret redaction, configurable retention, central storage,
  `LOG_PROMPTS=false`.
- **Customer web app** — signup/login, account & billing (Stripe), cost
  dashboard. Production hardening: security headers, rate limit, `/ready`,
  graceful shutdown. MiniLM in-process embeddings.
