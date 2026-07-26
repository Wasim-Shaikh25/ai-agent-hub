# Progress — User-facing platform hardening

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Create `REQUIREMENTS.md` and `PROGRESS.md` | Done | Captured R1–R6 |
| 2 | Audit & replace `snake_case` in user-facing UI strings | Done | Capitalised labels, removed `tokens/mo` etc. |
| 3 | Add `ENABLE_AI_ASSISTANT` feature flag + guard operator copilot | Done | `config.enableAiAssistant`, route guard, UI tab hidden when false |
| 4 | Build `/help` page with search | Done | Public page with client-side search + ticket form |
| 5 | Add `support_ticket` table, API, and user form | Done | Migration 018 + `/api/tickets` + `/api/platform/tickets` |
| 6 | Wire user-facing errors into `system_event` triage log | Done | Tickets record `source: 'user'` events |
| 7 | Add Google OAuth sign-up/login | Done | `/auth/oauth/google` + `oauth_identity` table |
| 8 | Add Apple + mobile OTP stubs/schema | Done | UI buttons + `/auth/oauth/:provider` route stubs |
| 9 | Run lint/build/tests and open PR | Done | `npm run build`/`test` and `npx vsce package` pass; server `typecheck`/`build`/`test` pass |
| 10 | Harden extension packaging | Done | Added `.vscodeignore` + `LICENSE`; populated `activationEvents`; removed `shell: true`; added path traversal checks |
| 11 | Env-fed superadmin + OTP login | Done | `SUPERADMIN_EMAIL`/`MOBILE`/`PASSWORD`, `/auth/superadmin/login`, `/superadmin-login` page, `otp_code` table, SMTP/console delivery |
| 12 | Superadmin org provisioning | Done | `POST /api/platform/orgs` with `admin_email`, `/superadmin` add-org form |
| 13 | SSO/OAuth domain auto-join | Done | `/auth/sso/callback` and `/auth/oauth/:provider/callback` resolve by explicit slug then admin-email domain; owner/admin promotion works |
| 14 | Dashboard visibility | Done | `/admin` API-gated, `/superadmin` superadmin-only, `/activity` user dashboard with `/api/me/activity` |
| 15 | Automated dashboard validation | Done | `server/test/auth-flow.test.mjs` covers superadmin OTP, org creation, SSO owner/member, role promotion, activity, and page visibility |
