# Requirements — User-facing platform hardening

## Background
The `claude/multi-agent-ai-platform-9sigxi` branch turns AI Agent Hub into a hosted, multi-tenant control plane. Before it can be opened to users, the public UI and auth flow need to be hardened so that:
1. Users see plain, readable labels instead of code-style `snake_case` strings.
2. No AI assistant / chat / copilot is exposed to org/team/individual users because LLM calls are too expensive at this stage.
3. Users can self-serve help and open support tickets.
4. Operators can triage user-reported issues through a structured log.
5. Sign-up supports common identity providers (Google, Apple, email, mobile) instead of only email+password.

## Functional Requirements

### R1 — Readable UI labels
- All user-facing text in server-rendered HTML, route error messages, and the VS Code command titles must use normal English words.
- No `snake_case`, `camelCase`, or all-lowercase code tokens should be shown to end users.
- Examples to fix: `bad_request` → "Bad request", `monthlyRequests` → "Monthly requests", `aiAgentHub` → "AI Agent Hub".

### R2 — Disable user-facing AI assistant
- Add a runtime feature flag `ENABLE_AI_ASSISTANT` (default `false`).
- Any endpoint that could expose a conversational assistant to a non-superadmin user must return `503 feature_disabled`.
- The existing operator copilot (`/api/platform/assistant`) may remain available only to platform super-admins if `ENABLE_AI_ASSISTANT=true`.
- Replace any per-org/team/user "Ask AI" UI with a prominent **Help** link.

### R3 — Searchable Help page
- Add a public `/help` page (or `/docs`) with a client-side search box.
- Topics must cover sign-up, login, model selection, API keys, billing, agent connection, and how to open a ticket.
- The Help page must be reachable from the login, account, and admin pages without authentication.

### R4 — User ticket / issue reporting
- Authenticated users can open a support ticket via `POST /api/tickets` with `subject`, `body`, and optional `category`.
- Tickets are stored in Postgres (`support_ticket`) and linked to the user's org.
- Operators can list/comment/close tickets via `/api/platform/tickets` (super-admin only).
- The `/help` page includes a "Open a ticket" form for logged-in users.

### R5 — Operator triage log
- Existing `system_event` already records operational issues.
- Extend it to also capture user-facing errors (auth failures, ticket opens, failed gateway calls) with `source = 'user'`.
- Surface user-impacting events in the super-admin console with a filter.

### R6 — Registration identity providers
- Keep email+password.
- Add **Google OAuth** sign-up/login via a generic `/auth/oauth/:provider` route and `oauth_identity` table.
- Add placeholders/stubs for **Apple** and **mobile OTP** sign-up (provider-specific secrets and SMS gateway are out of scope; the schema and route contract must be ready).
- All OAuth sign-ups still create an org + membership exactly like the email/password flow.

## Non-functional Requirements
- All new routes must use the existing Fastify/Postgres stack and follow the same auth/audit patterns.
- All changes must be covered by the existing CI (lint, build, test) where applicable.
- No external paid services are required to run the app in dev/test mode (`dev` SSO provider continues to work offline).
