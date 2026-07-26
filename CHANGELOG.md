# Changelog

All notable changes to the **Hub server** (the paid, server-side control plane).
Format loosely follows [Keep a Changelog](https://keepachangelog.com/); the
VS Code extension is versioned separately via GitHub Releases (see `README.md`).

## [Unreleased]

### Added — superadmin OTP, org provisioning, and domain-based SSO/OAuth

- **Env-fed superadmin** — `SUPERADMIN_EMAIL`, `SUPERADMIN_MOBILE`, `SUPERADMIN_PASSWORD`,
  and optional `SUPERADMIN_ID` seed the platform owner on first boot.
- **OTP login** — `/superadmin-login` calls `/auth/superadmin/login` (sends OTP)
  and `/auth/superadmin/verify-otp` returns a JWT. Codes are sent via SMTP when
  configured; otherwise printed to stdout in dev/test for validation.
- **Superadmin org provisioning** — `/superadmin` has an "Add organization" form;
  `POST /api/platform/orgs` creates an org with name, slug, plan, and `admin_email`.
- **Domain-based SSO/OAuth auto-join** — `/auth/sso/callback` and
  `/auth/oauth/:provider/callback` resolve the workspace by explicit `org` slug
  first, then by matching the user's email domain to an org's `admin_email` domain.
  The first exact `admin_email` match becomes `owner`; later same-domain users
  become `member`.
- **User activity dashboard** — new `/activity` page and `GET /api/me/activity`
  show the signed-in user's requests, tokens, cost, model usage, connected agents,
  and recent actions.
- **Automated auth-flow validation** — `server/test/auth-flow.test.mjs` exercises
  the superadmin OTP flow, org creation, SSO owner assignment, domain member
  auto-join, admin promotion, and role-gated dashboard visibility.

### Added — integration test suite + CI

- `server/test/` — a black-box integration suite on Node's built-in test runner
  (no new deps): spawns the built server + a mock LLM and exercises health/ready,
  auth, entitlements (free 402 vs enterprise allow), memory, code-aware RAG
  (BM25), gateway metering, model catalog + per-user model choice, MCP-handshake
  agent detection, and RLS (cross-org isolation, no cross-request bleed,
  platform-admin bypass). `npm test`. Server CI now runs it against
  Postgres+pgvector instead of a one-line smoke check.

### Fixed — Row-Level Security actually enforces now

- RLS was **enabled but dormant**: the `app.current_org` GUC that the policies
  key on was never set (the `withOrg()` helper was dead code), so every row
  passed. `rls` is an advertised Enterprise feature, so this was a real gap.
- `query()`/`queryOne()` now bind the request's org via AsyncLocalStorage
  (`setOrgContext()` in `requireAuth` + the MCP handler) and run with
  `SET LOCAL app.current_org` when `RLS_ENABLED=true`, so Postgres enforces
  tenant isolation. Platform-admin routes `clearOrgContext()` to read across
  orgs; auth bootstrap and background jobs stay permissive.
- **Migration 017** fixes a connection-reuse bug: after `SET LOCAL`, the custom
  GUC reverts to `''` (not unset), which made a reused pooled connection error on
  `''::uuid`. The policy now uses `NULLIF(current_setting(...), '')` so `''` and
  unset both read as "no org". Verified: cross-org reads/writes blocked, no
  cross-request bleed, platform-admin cross-org reads intact.
- Default (`RLS_ENABLED=false`) behavior is unchanged. Removed the dead
  `withOrg()` and `containsSensitive()` helpers.

### Added — Agents & Models console

- **Connected-agent detection (server-side, no local scanner)** — the Hub reads
  each MCP client's `initialize` handshake (`clientInfo`) and each gateway
  request's `x-hub-agent`/`User-Agent`, normalizes the name, and upserts an
  `agent_connection` row. Generic HTTP clients (curl, requests, …) are filtered
  out. Shows *what is actually using the Hub* — any agent, not a hardcoded list.
- **`GET /api/agents`** — connected agents for the org (agent, via mcp/gateway,
  last model, call count, last seen).
- **Model catalog** — `GET /v1/models` (OpenAI-standard, read by agents/tools)
  and `GET /api/models` (UI shape + current default), sourced from
  `deploy/litellm.config.yaml` or `HUB_MODELS`, embeddings filtered out.
- **User-oriented model selection** — each developer picks their **own** model,
  self-serve, on their Account page (`GET/PUT /api/me/model`, any member). The
  user's choice is applied Hub-side when their agent doesn't pin a model, and it
  **beats org quality routing** (an intentional choice wins). An explicit request
  model always wins; we never override an agent's internal picker.
- **Admin org default** — `PUT /api/settings/default-model` (admin) is only a
  **fallback** for users who haven't chosen; it never overrides a user.
- **`/admin` → Agents & Models tab** — connected agents, model catalog, and the
  org fallback-default selector. **`/account`** gains the user's own model picker.
- **CLI helpers** — `aihub models` and `aihub agents` list the catalog and the
  connected agents.
- **Local detection** — `aihub detect` scans the machine for running/installed
  agents (Cursor, Kiro, Windsurf, VS Code, CLI agents) and reports to
  `POST /api/agents/local`; `--connect` wires them all. The Agents tab groups by
  agent (strongest of connected>running>installed) with a **Connect** action for
  those not yet wired. Kiro added as a connectable agent.
- Requirements/design: `docs/specs/17-agents-models-console.md`.

### Migrations (this set)

- `014_agents.sql` — `agent_connection` (+ `(org_id, last_seen)` index).
- `015_user_model.sql` — `user_model_pref` (per-user model choice).
- `016_agent_status.sql` — `agent_connection.status` (connected/running/installed).

### Config (this set)

- `HUB_MODELS` — comma list overriding the model catalog.

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
