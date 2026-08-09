# AI Agent Hub — Production Readiness Audit

**Repository:** `Wasim-Shaikh25/ai-agent-hub`  
**Assessed commit:** `dd15bc7` (`main` after merging PR #10 and PR #11)  
**Extension version:** `0.0.7`  
**Server version:** `0.1.0`  
**Audit date:** 2026-08-09  
**Auditor:** Devin (cross-functional review)

---

## Executive Summary

AI Agent Hub has expanded from a local VS Code: extension into a full SaaS platform: the extension (Content Plane) now connects to a `hub-server` (Context / Gateway / Governance Planes) that provides shared sessions, memory, code-aware RAG, MCP aggregation, RBAC, SSO, billing, and admin/operator consoles. PR #10 also added a CLI connector, a customer web app, a marketing landing page, Docker Compose stacks, and extensive legal/spec docs.

The good news: both the extension unit tests (38 pass) and the server integration tests (26 pass) are green, and the server builds and typechecks cleanly. The architecture is well documented and the test suite covers auth, RLS, entitlements, RAG, gateway fallback, and MCP aggregation.

The bad news: **the product is not ready for production or public release.** The packaged VS Code: extension still cannot activate because runtime dependencies are omitted, and the server ships with hardcoded/default secrets, Row-Level Security disabled by default, a long list of runtime dependency CVEs, and no validated production deployment path.

**Final recommendation:** **STOP — DO NOT GO**

Do not publish the extension, deploy the server, or onboard paying customers until the packaging/runtime-dependency issue, the server's default security posture, and its runtime dependency CVEs are resolved.

### Finding summary

| Severity | Count | Examples |
|----------|-------|----------|
| Critical | 3 | Packaged `.vsix` cannot activate; server defaults to hardcoded `JWT_SECRET` / `SUPERADMIN_PASSWORD`; `protobufjs` critical CVE in server runtime path |
| High | 6 | `fast-uri` via `ajv`; `mcp-proxy` unpinned; server `RLS_ENABLED=false` by default; server `Dockerfile` runs as root with `npm install`; `nodemailer`, `hono`, `ip-address` runtime CVEs |
| Medium | 6 | No packaging validation in CI; missing production deploy/backup/monitoring; dev seed enabled by default; `PRODUCTION_READINESS_AUDIT.md` and `.agents/` leak into `.vsix`; duplicate item names can overwrite files; CSP disabled for web UI |
| Low | 5 | YAML frontmatter parser not YAML-compliant; README command mismatch; MCP port conflict not OS-checked; `Validator` silently skips missing schemas; `CHANGELOG.md`/`SECURITY.md` bundled in `.vsix` |

### Major technical risks

1. **Extension packaging defect:** `npx vsce package --no-dependencies` creates a `.vsix` with no `node_modules`, but `out/core/validator.js` requires `ajv`. The package activates with `Error: Cannot find module 'ajv'`.
2. **Server default secrets:** `JWT_SECRET`, `SUPERADMIN_PASSWORD`, `DEV_API_KEY`, `DEV_SEED`, and `CORS_ORIGIN='*'` all have unsafe defaults. A deployment that does not override every value is trivially compromised.
3. **Row-Level Security disabled by default:** Migration 005 installs RLS policies, but `config.ts` defaults `RLS_ENABLED=false`, so tenant isolation relies entirely on application-level `org_id` filtering.
4. **Server runtime dependency CVEs:** `protobufjs` (critical, via optional `@xenova/transformers`), `sharp`, `hono`, `ip-address`, and `nodemailer` all have high-severity advisories reachable at runtime.
5. **No production hardening validated:** Docker Compose and the `Dockerfile` have only been exercised on `localhost`; backups, monitoring, TLS termination, secret injection, and real Stripe webhooks are documented but not validated.
6. **MCP runtime unpinned:** `mcp-proxy` is still fetched via `npx` with no declared, version-locked dependency.
7. **Supply chain (extension):** Root `npm audit` reports 14 vulnerabilities, including a critical `vitest` issue and multiple high-severity transitive deps.

### Scope limitations and untested areas

- The extension was not installed or run in a real VS Code: Extension Host in this audit (only the stub-activation reproduction was rerun).
- Real file sync into Cursor/Kiro/Copilot/Amazon Q folders was not retested.
- MCP server end-to-end startup against a real package was not retested.
- The Docker Compose production stack was not built or deployed.
- TLS termination, managed Postgres backups, Redis persistence, and Stripe webhook verification were not exercised.
- Load, concurrency, and penetration testing were not performed.
- Windows path handling and `npx.cmd` behavior were inferred from code.

---

## Product Context and Audit Coverage

### Discovered product purpose and requirements

- **Extension (Content Plane):** A VS Code: extension for authoring skills, rules, hooks, workflows, and personas, then syncing them to local agent target folders.
- **Server (Context / Gateway / Governance Planes):** A Fastify + Postgres (pgvector) + Redis service that provides shared sessions, memory, code-aware RAG, native MCP, LiteLLM gateway proxying, RBAC, API keys, audit logging, Stripe billing, SSO, and customer/operator web consoles.
- **CLI:** `aihub connect <agent>` / `aihub detect` for non-VS-Code: agents.
- **Web surfaces:** Marketing landing page (`site/index.html`) and server-rendered customer/operator HTML at `/login`, `/account`, `/admin`, `/superadmin`, `/dashboard`, `/activity`, `/help`, etc.
- **Target users:** Individuals, teams, and enterprises using multiple AI coding agents.
- **Roles:** Local developer (extension only), org `owner`/`admin`/`member`/`viewer`, platform `superadmin`.
- **Sensitive data handled:** User workspace paths, authored prompt content, MCP environment variables (extension), customer source code context/memory (server), API keys, JWT sessions, billing/usage records, audit logs.
- **External integrations:** Git CLI for builtin content updates; `npx` for MCP packages; VS Code: Extension API; Postgres; Redis; LiteLLM; Stripe; WorkOS/OAuth providers; email/SMTP.

### Architecture and trust boundaries

- **Applications / services:**
  - VS Code: extension (`main: out/extension.js`).
  - `hub-server` (`server/src/index.ts` → `dist/index.js`).
  - `aihub` CLI (`cli/index.mjs`).
  - Marketing site (`site/index.html`).
- **Entry points:**
  - Extension: `activate()` in `src/extension.ts`; 10 registered commands.
  - Server: HTTP on `:8080`, `/health`, `/ready`, `/api/*`, `/mcp`, `/v1/*` gateway routes, and web UI routes.
- **State management:**
  - Extension: VS Code: `Memento`, in-memory `Registry`, file-system writes, child processes.
  - Server: Postgres with per-org RLS (when enabled), Redis for cache/rate-limit, `AsyncLocalStorage` for org context.
- **Trust boundaries:**
  - Extension runs with the user's OS privileges; sync writes are constrained by `PathUtils`.
  - Server is multi-tenant; tenant isolation relies on app-layer `org_id` filtering plus (opt-in) Postgres RLS.
  - MCP servers run as child processes locally; the extension validates package names and arguments.
  - Server gateway proxies to LiteLLM with API-key auth and budget enforcement.

### Files, routes, APIs, and modules reviewed

- `package.json`, `tsconfig.json`, `vitest.config.ts`, `.eslintrc.cjs`, `.prettierrc`, `.vscodeignore`
- `src/extension.ts`, `src/core/*.ts`, `src/ui/*.ts`, `src/commands/*.ts`, `src/utils/*.ts`
- `tests/**/*.test.ts`, `__mocks__/vscode.ts`
- `server/package.json`, `server/tsconfig.json`, `server/Dockerfile`
- `server/src/index.ts`, `server/src/config.ts`, `server/src/auth.ts`, `server/src/db/{pool,migrate}.ts`
- `server/src/routes/{api,auth,admin,adminui,activity,billing,dashboard,gateway,help,metrics,oauth,platform,privacy,superadminui,tickets,webapp}.ts`
- `server/migrations/001_init.sql` through `020_superadmin_and_otp.sql`
- `server/test/*.test.mjs`
- `deploy/docker-compose.yml`, `deploy/docker-compose.prod.yml`, `deploy/.env.example`, `deploy/litellm.config.yaml`
- `cli/package.json`, `cli/index.mjs`
- `site/index.html`
- `docs/LAUNCH-READINESS.md`, `docs/REMAINING.md`, `docs/DEPLOYMENT.md`
- `.github/workflows/ci.yml`, `.github/workflows/server-ci.yml`, `.github/workflows/release.yml`

### Commands and tests executed

| Check | Command | Result |
|-------|---------|--------|
| Extension lint | `npm run lint` | Pass (exit 0) |
| Extension build | `npm run build` | Pass (exit 0) |
| Extension unit tests | `npm test` | Pass — 38 tests in 6 files |
| Extension format check | `npm run format:check` | Pass |
| Extension VSIX package | `npx vsce package --no-dependencies` | Pass, but `.vsix` lacks `node_modules` |
| Extension VSIX stub activation | `node -e "require('./out/extension.js')"` with stub `vscode` | **Fail** — `Cannot find module 'ajv'` |
| Extension dependency audit | `npm audit --audit-level=low` | **14 vulnerabilities** (2 moderate, 11 high, 1 critical) |
| Server dependency install | `(cd server && npm install)` | Pass |
| Server typecheck | `(cd server && npm run typecheck)` | Pass |
| Server build | `(cd server && npm run build)` | Pass |
| Server migrations + seed | `(cd server && env DATABASE_URL=... npm run migrate)` | Pass — 20 migrations applied |
| Server integration tests | `(cd server && env DATABASE_URL=... npm test)` | Pass — 26 tests |
| Server dependency audit | `(cd server && npm audit --audit-level=low)` | **13 vulnerabilities** (3 moderate, 9 high, 1 critical) |

### Assumptions, contradictions, exclusions, and limitations

- **Assumptions:** The product is now intended to become a hosted SaaS with optional self-hosting. The extension remains the free local Content Plane.
- **Contradictions resolved:** `package.json` and `README.md` now list the same 10 extension commands; `activationEvents` cover all of them plus `onStartupFinished`.
- **Contradictions remaining:** `docs/LAUNCH-READINESS.md` correctly flags P0 blockers, but those blockers are still open in code/config.
- **Exclusions:** Real VS Code: host testing, real agent sync, Docker production deploy, TLS/backup/restore, load testing, and penetration testing were not performed.

---

## Product Completeness Assessment

### Role-to-Capability Matrix (extension)

| Role | Create Content | Manage Agents | Sync | Manage MCP | View Results |
|------|---------------|---------------|------|------------|--------------|
| Local Developer | Implemented | Implemented | Implemented | Implemented (runtime packaging broken) | Implemented |

### Role-to-Capability Matrix (server)

| Role | Create Org | Manage Team | Create API Keys | View Usage | Manage Content | Admin Console | Superadmin Console |
|------|-----------|-------------|-----------------|------------|----------------|---------------|-------------------|
| Unauthenticated | Sign up / login | — | — | — | — | — | — |
| Member (org) | — | — | — | Own activity | Read | — | — |
| Admin/Owner | — | Yes | Yes | Org dashboard | Yes | Yes | — |
| Superadmin | Yes (org provisioning) | — | — | — | — | — | Yes |

### Workflow Completeness Matrix (server — high level)

| Workflow | Start | Input Validation | Happy Path | Status Visibility | Failure Handling | Auth/RLS | Verdict |
|----------|-------|------------------|------------|-------------------|------------------|----------|---------|
| Sign up / login | `/login` | Zod + password length | Token issued | Account page | Error toast | Password hash + JWT | Implemented |
| Org creation | `/superadmin` | Email/org/slug/plan | Org created | Superadmin list | 403/400 | Superadmin JWT | Implemented |
| API key management | `/account` | Name required | Key created | Key displayed once | Error toast | Authenticated + org | Implemented |
| Memory write/search | `/api/memory` | Body validation | Stored/returned | API response | 500 envelope | API key + org | Implemented |
| RAG index/query | `/api/rag/*` | Body validation | Results returned | API response | 500 envelope | API key + org | Implemented |
| Gateway proxy | `/v1/*` | Header/body validation | Proxied to LiteLLM | Streaming response | 429/402 | API key + org + budget | Implemented |
| MCP aggregation | `/mcp` | JSON-RPC + auth | Tools namespaced | Tools list | 401/500 | API key + org | Implemented |
| Billing upgrade | `/account` | `priceId` | Stripe checkout | Redirect | Error message | Authenticated + org | Implemented (uses placeholder `price_team`) |
| Operator issue analysis | `/superadmin` | — | Events/summary | Issues tab | Offline fallback | Superadmin + feature flag | Implemented |

### Missing requirements and discovery gaps

1. **Extension packaging validation in CI** — Missing. CI packages the `.vsix` but does not verify its contents or activation.
2. **Duplicate item-name guard** — Missing in extension. Two enabled items with the same name overwrite each other on sync.
3. **Server production hardening** — Missing validated production deployment, backups, monitoring, and real payment/webhook integration.
4. **Server security defaults** — Missing safe defaults for `JWT_SECRET`, `SUPERADMIN_PASSWORD`, `RLS_ENABLED`, `DEV_SEED`, `CORS_ORIGIN`.
5. **Runtime dependency CVE remediation** — Missing. Both extension and server have high/critical CVEs in runtime-reachable packages.
6. **Extension/server integration test** — Missing. There is no test that verifies the extension can authenticate and call the server end-to-end.
7. **CSP for web UI** — `helmet` CSP is disabled; the web UI uses inline scripts and `style` attributes.

---

## Detailed Findings

### AUDIT-001 — Packaged VS Code: extension cannot activate (runtime dependencies missing)

- **Classification:** Confirmed Defect
- **Severity:** Critical
- **Category:** Packaging / Deployment
- **Disposition:** Open — Release Blocker
- **Release impact:** Any user installing the published `.vsix` will get `Cannot find module 'ajv'` on activation.
- **Affected roles:** All end users.
- **Affected files/locations:**
  - `package.json` (`"dependencies": { "ajv": "^8.12.0" }`)
  - `package.json` (`"scripts": { "package": "vsce package --no-dependencies" }`)
  - `out/core/validator.js:40` (`const ajv_1 = __importDefault(require("ajv"));`)
  - `.github/workflows/release.yml:63` (`npx vsce package --no-dependencies -o ai-agent-hub.vsix`)
- **Evidence and reproduction:**
  ```bash
  npm run package
  # ... no extension/node_modules entries
  ```
  Extracted `.vsix` with a stub `vscode` module and ran `node -e "require('./out/extension.js')"`:
  ```text
  Error: Cannot find module 'ajv'
  Require stack:
  - /tmp/vsix-check-merged/extension/out/core/validator.js
  - /tmp/vsix-check-merged/extension/out/extension.js
  ```
- **Root cause:** `vsce package --no-dependencies` intentionally omits `node_modules`, and there is no bundler inlining dependencies into `out/extension.js`.
- **Recommended solution:** Remove `--no-dependencies` from `package.json` and `release.yml`, or add a bundler (esbuild/webpack) to produce a self-contained `out/extension.js`.
- **Tests to add:** CI step that extracts the `.vsix` and verifies `node_modules/ajv` exists or that `out/extension.js` has no external `require` calls.

### AUDIT-002 — MCP runtime is not packaged or pinned

- **Classification:** Confirmed Defect
- **Severity:** High
- **Category:** Security / Reliability / Deployment
- **Disposition:** Open — Release Blocker (if MCP ships in MVP)
- **Release impact:** `mcp-proxy` is fetched by `npx` at runtime with no declared/pinned version and no offline support.
- **Affected files/locations:** `src/core/mcpManager.ts:45-74`, `package.json`
- **Evidence:** `package.json` has no `mcp-proxy` dependency. `McpManager.start` executes `npx mcp-proxy --port <port> -- npx <packageName> ...args`.
- **Recommended solution:** Add `mcp-proxy` to `dependencies` with an exact version and invoke the resolved binary from `node_modules/.bin/mcp-proxy`; or remove MCP features from v1.

### AUDIT-003 — Vulnerable transitive runtime dependency `fast-uri` via `ajv`

- **Classification:** Probable Risk
- **Severity:** High
- **Category:** Security / Dependencies
- **Disposition:** Open — Required Before Release
- **Release impact:** `ajv@8.20.0` → `fast-uri@3.1.0` has known path-traversal and host-confusion CVEs.
- **Affected files/locations:** `package.json`, `src/core/validator.ts`, `node_modules/fast-uri@3.1.0`
- **Evidence:** `npm ls fast-uri` shows `ajv@8.20.0` → `fast-uri@3.1.0`. `npm audit` flags `fast-uri <=3.1.4`.
- **Recommended solution:** `npm update ajv` or add an `overrides` entry for `fast-uri >=3.1.5`, then re-run `npm audit` and tests.

### AUDIT-004 — Dev and build dependency vulnerabilities (extension)

- **Classification:** Probable Risk
- **Severity:** Medium
- **Category:** Supply Chain / DevOps
- **Disposition:** Open — Required Before Release
- **Release impact:** Compromised build tools could affect the generated `.vsix`.
- **Affected files/locations:** `package-lock.json`, `node_modules/{vitest,postcss,undici,tmp,linkify-it,markdown-it,nanoid,vite,qs}`
- **Evidence:** `npm audit --audit-level=low` reports 14 vulnerabilities: `vitest` critical, `undici`/`vite`/`postcss`/`tmp`/`linkify-it`/`nanoid` high, `qs` moderate, plus `fast-uri`.
- **Recommended solution:** Update `@vscode/vsce` to >=3.9.2, `vitest` to >=3.2.6, and run `npm audit fix`; verify build/package/test still pass.

### AUDIT-005 — Duplicate extension item names can overwrite each other on sync

- **Classification:** Confirmed Defect
- **Severity:** Medium
- **Category:** Data Integrity
- **Disposition:** Open — Required Before Release
- **Release impact:** Two enabled items with the same name write the same slug file; the second clobbers the first.
- **Affected files/locations:** `src/core/registry.ts:90-112`, `src/core/fileWriter.ts:49-71`
- **Evidence:** `FileWriter` computes `slug = slugify(item.name)` and writes `path.join(targetDir, `${slug}.${ext}`)`. Registry does not enforce unique names per type.
- **Recommended solution:** Enforce unique names in `Registry.addItem`/`updateItem` or disambiguate file names in `FileWriter`.

### AUDIT-006 — No end-to-end extension-host or packaging validation

- **Classification:** Confirmed Missing Requirement
- **Severity:** Medium
- **Category:** Testing / Release Operations
- **Disposition:** Open — Required Before Release
- **Release impact:** Unit tests do not catch packaging or activation failures.
- **Affected files/locations:** `.github/workflows/ci.yml`, `.github/workflows/release.yml`
- **Evidence:** CI packages the `.vsix` but never extracts it or installs it in VS Code:.
- **Recommended solution:** Add a CI step that extracts the `.vsix` and fails if runtime deps are missing; add a lightweight Extension Host smoke test with `@vscode/test-cli`.

### AUDIT-007 — Remote builtin content update overwrites installed extension files

- **Classification:** Probable Risk
- **Severity:** Medium
- **Category:** Security / Data Integrity
- **Disposition:** Needs Product Decision
- **Release impact:** `HubUpdater` writes fetched content into `extensionPath/hub-content/`, which may be read-only or reverted on extension update.
- **Affected files/locations:** `src/core/hubUpdater.ts:91-136`, `src/core/syncEngine.ts:82-88`
- **Recommended solution:** Store updated builtins in `context.globalStorageUri`/`<globalStorage>/hub-content` and load from there first, falling back to bundled files.

### AUDIT-008 — Extension frontmatter parser is not YAML-compliant

- **Classification:** Design Concern
- **Severity:** Low
- **Category:** Data Integrity / Maintainability
- **Disposition:** Scheduled Post-Release
- **Release impact:** Builtin files with quoted colons or multi-line values may parse incorrectly.
- **Affected files/locations:** `src/core/registry.ts:209-227`
- **Recommended solution:** Use a YAML parser for frontmatter or update README to describe the format as simple `key: value`.

### AUDIT-009 — README and `package.json` commands now consistent

- **Classification:** Design Concern (resolved)
- **Severity:** Low
- **Category:** Documentation / Consistency
- **Disposition:** Closed
- **Evidence:** `package.json` contributes the same 10 commands listed in `README.md`.
- **Note:** No action required; tracked for completeness.

### AUDIT-010 — MCP port conflict check is config-only

- **Classification:** Probable Risk
- **Severity:** Low
- **Category:** Reliability
- **Disposition:** Scheduled Post-Release
- **Release impact:** `McpManager` may fail if a port is already in use.
- **Affected files/locations:** `src/core/mcpStore.ts:50-53`
- **Recommended solution:** Add an OS bind check before spawning or handle `EADDRINUSE` with a clear error.

### AUDIT-011 — Audit report and skill files bundled into `.vsix`

- **Classification:** Confirmed Defect
- **Severity:** Medium
- **Category:** Packaging / Privacy
- **Disposition:** Open — Required Before Release
- **Release impact:** `PRODUCTION_READINESS_AUDIT.md` (38.35 KB), `.agents/skills/...`, `CHANGELOG.md`, and `SECURITY.md` are shipped to every user.
- **Affected files/locations:** `.vscodeignore`, `ai-agent-hub-0.0.7.vsix`
- **Evidence:** `unzip -l ai-agent-hub-0.0.7.vsix` lists `extension/PRODUCTION_READINESS_AUDIT.md` and `extension/.agents/skills/ai-agent-hub-extension-testing/SKILL.md`.
- **Recommended solution:** Add `PRODUCTION_READINESS_AUDIT.md`, `.agents/`, `CHANGELOG.md`, `SECURITY.md`, `docs/`, `server/`, `cli/`, `deploy/`, and `site/` to `.vscodeignore` (some already present; `PRODUCTION_READINESS_AUDIT.md` and `.agents/` are missing).

### AUDIT-012 — Validator silently skips validation when schema is missing

- **Classification:** Design Concern
- **Severity:** Low
- **Category:** Data Integrity / Reliability
- **Disposition:** Scheduled Post-Release
- **Release impact:** If a schema file is missing, invalid data can be persisted without warning.
- **Affected files/locations:** `src/core/validator.ts:56-62`
- **Recommended solution:** Return a dedicated error when a requested schema is not loaded.

### AUDIT-S001 — Server ships with hardcoded/default secrets and insecure defaults

- **Classification:** Confirmed Defect
- **Severity:** Critical
- **Category:** Security / Configuration
- **Disposition:** Open — Release Blocker
- **Release impact:** Any deployment that does not override every environment variable is trivially compromised.
- **Affected roles:** All server users, orgs, and the platform operator.
- **Affected files/locations:**
  - `server/src/config.ts:60-113` (`JWT_SECRET`, `SUPERADMIN_PASSWORD`, `DEV_API_KEY`, `DEV_SEED`, `CORS_ORIGIN`, `RLS_ENABLED`, `superadminEmail`)
  - `server/src/index.ts:30-32` (`migrate()`, `seedDev()`, `seedSuperadmin()` called before listen)
- **Evidence:**
  - `JWT_SECRET` defaults to `dev-secret-change-me`.
  - `SUPERADMIN_PASSWORD` defaults to `change-me` and `SUPERADMIN_EMAIL` to `admin@localhost`.
  - `DEV_SEED` defaults to `true`, `DEV_API_KEY` to `hub_dev_localkey`.
  - `CORS_ORIGIN` defaults to `*`.
  - `seedSuperadmin()` runs on every boot if `superadminEmail` is set and creates/updates a platform admin with the configured password hash.
- **Root cause:** Configuration uses unsafe fallbacks and `seedSuperadmin()` is unconditional.
- **Impact:**
  - Anyone can forge JWTs signed with the known `JWT_SECRET`.
  - Anyone can log in as the default superadmin with password `change-me`.
  - A fresh production instance silently seeds a `dev` org and a known API key if `DEV_SEED` is not disabled.
  - CORS `*` allows any origin to call the API with credentials.
- **Likelihood:** Certain for any deployment that copies the `.env.example` without full overrides.
- **Recommended solution:**
  1. Remove all unsafe fallbacks for security-critical values (`JWT_SECRET`, `SUPERADMIN_PASSWORD`, `DEV_API_KEY`) and fail fast with a clear error if they are not set.
  2. Default `DEV_SEED` to `false` and only enable it in a dedicated `dev`/`test` Docker Compose override.
  3. Default `RLS_ENABLED` to `true`.
  4. Default `CORS_ORIGIN` to the value of `APP_BASE_URL` instead of `*`.
  5. Update `.env.example` and `deploy/docker-compose.prod.yml` to require these values and provide a production-check script.
- **Tests to add:** A startup test that asserts the server refuses to boot when `JWT_SECRET` or `SUPERADMIN_PASSWORD` are the default/empty.
- **Verification steps:**
  1. Run `npm start` without `JWT_SECRET` and confirm it exits with an error.
  2. Run with `DEV_SEED=false` and confirm no dev org/API key is created.

### AUDIT-S002 — Row-Level Security is disabled by default

- **Classification:** Confirmed Defect
- **Severity:** High
- **Category:** Security / Multi-tenancy
- **Disposition:** Open — Release Blocker
- **Release impact:** Tenant isolation relies entirely on application-layer `org_id` filtering; a bug or SQL injection could leak data across orgs.
- **Affected roles:** All org users.
- **Affected files/locations:**
  - `server/src/config.ts:80` (`RLS_ENABLED` defaults to `false`)
  - `server/src/db/pool.ts:40-42` (`exec` only sets `app.current_org` when `config.rlsEnabled` is true)
  - `server/migrations/005_rls.sql` (RLS policies installed but not enforced when off)
- **Evidence:** `env('RLS_ENABLED', 'false') === 'true'`; `config.rlsEnabled` is `false` unless explicitly set.
- **Root cause:** RLS is treated as an opt-in feature despite being a defense-in-depth control for multi-tenancy.
- **Impact:** Any missed `org_id` filter or SQL injection could expose other tenants' data.
- **Recommended solution:** Default `RLS_ENABLED` to `true`, require it in production, and provide a documented escape hatch only for the platform superadmin/global reads.

### AUDIT-S003 — Server Dockerfile uses `npm install`, runs as root, and lacks production hardening

- **Classification:** Confirmed Defect
- **Severity:** High
- **Category:** Security / Deployment
- **Disposition:** Open — Required Before Release
- **Release impact:** Production image is larger than necessary, may install unintended versions, and runs as root.
- **Affected files/locations:** `server/Dockerfile`
- **Evidence:**
  ```dockerfile
  FROM node:20-slim
  COPY package.json ./
  RUN npm install
  COPY . .
  RUN npm run build
  EXPOSE 8080
  CMD ["node", "dist/index.js"]
  ```
- **Root cause:** No multi-stage build, no `npm ci`, no `NODE_ENV=production`, no non-root user, no `.dockerignore`, no healthcheck in the Dockerfile.
- **Impact:**
  - `npm install` may install different versions than `package-lock.json`.
  - Optional dev dependencies (e.g., `tsx`) are kept in the image.
  - Container runs as root.
  - Build cache is less effective and image size larger.
- **Recommended solution:**
  1. Use a multi-stage build: install in a `builder` stage with `npm ci`, build, then copy only `package.json`, `package-lock.json`, and `dist/` to a runtime stage.
  2. Set `NODE_ENV=production` and run `npm ci --omit=dev` in the runtime stage.
  3. Create a non-root user (`USER node`) and `WORKDIR /app` with correct permissions.
  4. Add `HEALTHCHECK` and `.dockerignore`.

### AUDIT-S004 — Server runtime dependency vulnerabilities

- **Classification:** Probable Risk
- **Severity:** High
- **Category:** Security / Dependencies
- **Disposition:** Open — Required Before Release
- **Release impact:** Runtime-reachable packages have known high/critical CVEs.
- **Affected roles:** All server users.
- **Affected files/locations:** `server/package-lock.json`, `server/package.json`
- **Evidence:**
  ```bash
  (cd server && npm audit --audit-level=low)
  # 13 vulnerabilities (3 moderate, 9 high, 1 critical)
  ```
  Specific runtime-reachable paths:
  - `protobufjs@6.11.6` (critical) via `hub-server` → `@xenova/transformers` → `onnxruntime-web` → `onnx-proto`.
  - `sharp` (high) via `@xenova/transformers`.
  - `hono@4.12.31` (high) via `@modelcontextprotocol/sdk`.
  - `ip-address@10.2.0` (high) via `@modelcontextprotocol/sdk` → `express-rate-limit`.
  - `nodemailer@6.10.1` (high, direct dependency).
- **Root cause:** `@xenova/transformers` (optional dependency) and `@modelcontextprotocol/sdk` pull in vulnerable transitive packages; `nodemailer` is outdated.
- **Impact:** Remote code execution, SSRF/trust-boundary bypass, SMTP command injection, and DoS are possible depending on the advisory.
- **Recommended solution:**
  1. Update `nodemailer` to a patched version.
  2. Decide whether MiniLM embeddings are required in production. If not, remove `@xenova/transformers` from optional dependencies and rely on the `local` hash fallback.
  3. Update `@modelcontextprotocol/sdk` to a patched version or override the vulnerable transitive packages.
  4. Run `npm audit` until no high/critical runtime-reachable vulnerabilities remain.
- **Tests to add:** Re-run the full server test suite after updates.

### AUDIT-S005 — No validated production deployment, backups, or monitoring

- **Classification:** Missing Requirement
- **Severity:** High
- **Category:** Operations / Reliability
- **Disposition:** Open — Required Before Release
- **Release impact:** The product has only run on `localhost` and in CI with ephemeral containers. There is no evidence of a working production deploy.
- **Affected files/locations:** `deploy/docker-compose.yml`, `deploy/docker-compose.prod.yml`, `docs/DEPLOYMENT.md`, `docs/LAUNCH-READINESS.md`
- **Evidence:** `docs/LAUNCH-READINESS.md` lists "Deploy to real infrastructure", "Backups — and a tested restore", "Monitoring & alerting", and "Payments actually live" as still open.
- **Recommended solution:**
  1. Build and run the production Docker Compose stack end-to-end.
  2. Configure managed Postgres with automated backups and perform a restore drill.
  3. Add error tracking (Sentry), uptime checks on `/ready`, and alerts on the `system_event` error stream.
  4. Configure a real Stripe account, metered price, and webhook endpoint; replace `price_team`.

### AUDIT-S006 — Server web UI has `helmet` CSP disabled

- **Classification:** Probable Risk
- **Severity:** Medium
- **Category:** Security / Web
- **Disposition:** Open — Required Before Release
- **Release impact:** `contentSecurityPolicy: false` removes a key XSS defense for the customer/operator consoles.
- **Affected files/locations:** `server/src/index.ts:37`
- **Evidence:** `await app.register(helmet, { contentSecurityPolicy: false });`
- **Root cause:** CSP was disabled to support inline CSS/JS in the hand-rolled HTML strings.
- **Impact:** Any XSS vulnerability (e.g., reflected user input rendered without escaping) can execute scripts. The web UI does insert user data via `textContent` in most places, but a single missing escape is enough.
- **Recommended solution:**
  1. Move inline scripts/styles to external files and enable a strict CSP.
  2. If inline scripts must remain, use nonces or hashes and keep `script-src 'self'` with `'nonce-...'`.
  3. Audit all `innerHTML`/HTML concatenation for user-controlled values.

### AUDIT-S007 — Dev seed runs unless explicitly disabled

- **Classification:** Confirmed Defect
- **Severity:** Medium
- **Category:** Security / Configuration
- **Disposition:** Open — Required Before Release
- **Release impact:** A production deployment that forgets `DEV_SEED=false` creates a known `dev` org and API key (`hub_dev_localkey`).
- **Affected files/locations:** `server/src/config.ts:73`, `server/src/db/migrate.ts:36-76`, `server/src/index.ts:31`
- **Evidence:** `devSeed: env('DEV_SEED', 'true') === 'true'`; `seedDev()` runs before the server listens when enabled.
- **Recommended solution:** Default `DEV_SEED` to `false`; only enable it in `deploy/docker-compose.yml` and CI, never in `docker-compose.prod.yml`.

### AUDIT-S008 — Server has no lint/format checks

- **Classification:** Missing Requirement
- **Severity:** Low
- **Category:** Code Quality / DevOps
- **Disposition:** Open — Required Before Release
- **Release impact:** No automated formatting or linting gate for server code.
- **Affected files/locations:** `server/package.json` (no `lint` or `format` scripts), `.github/workflows/server-ci.yml`
- **Evidence:** Server CI runs `typecheck`, `build`, `migrate`, and `test` only.
- **Recommended solution:** Add `eslint` and `prettier` to `server/package.json` and to `.github/workflows/server-ci.yml`.

---

## Remediation Plan

### Immediate release blockers

1. **AUDIT-001 — Fix extension `.vsix` packaging.** Remove `--no-dependencies` or add a bundler. Add a CI packaging-validation step.
2. **AUDIT-S001 — Remove server default secrets.** Fail fast if `JWT_SECRET`, `SUPERADMIN_PASSWORD`, or `DEV_API_KEY` are unset or equal to defaults. Default `DEV_SEED=false` and `RLS_ENABLED=true`.
3. **AUDIT-S002 — Enable RLS by default.** Set `RLS_ENABLED=true` as the default and require it in production.
4. **AUDIT-S004 — Patch server runtime CVEs.** Update or remove `@xenova/transformers`, update `nodemailer`, update `@modelcontextprotocol/sdk` or its transitive deps. Re-run `npm audit` until no high/critical runtime vulnerabilities remain.
5. **AUDIT-002 — Pin MCP runtime.** Add `mcp-proxy` to extension `dependencies` with an exact version and call the resolved binary.

### Required pre-release work

6. **AUDIT-S003 — Harden server Dockerfile.** Use `npm ci`, multi-stage build, non-root user, `NODE_ENV=production`, and a `HEALTHCHECK`.
7. **AUDIT-003 — Patch `fast-uri` / update `ajv` in the extension.**
8. **AUDIT-004 — Update extension dev/build dependency CVEs.** Prioritize `@vscode/vsce` and `vitest`.
9. **AUDIT-005 — Prevent duplicate extension item-name data loss.**
10. **AUDIT-006 — Add extension packaging / extension-host validation to CI.**
11. **AUDIT-S006 — Enable CSP for server web UI.** Move inline scripts/styles out or use nonces/hashes.
12. **AUDIT-011 — Exclude dev/audit docs and `.agents/` from `.vsix`.**

### Short-term post-release improvements

13. **AUDIT-S005 — Validate production deployment.** Build and run `docker-compose.prod.yml`, configure backups, monitoring, and real Stripe.
14. **AUDIT-S007 — Remove dev seed from production path.**
15. **AUDIT-S008 — Add server lint/format to CI.**
16. **AUDIT-007 — Move remote builtin updates to global storage.**
17. **AUDIT-008 — Replace frontmatter parser or update README.**
18. **AUDIT-010 — Improve MCP port conflict handling.**
19. **AUDIT-012 — Harden Validator schema-missing behavior.**

---

## Residual Risks and Final Checklist

### Accepted and deferred risks

| Risk | Rationale | Disposition |
|------|-----------|-------------|
| No telemetry / crash reporting in extension | Local single-user MVP; can be added post-release | Accepted Risk |
| MCP executes arbitrary npm packages locally | User explicitly registers packages; mitigated by validation and `shell: false` | Accepted Risk (with documentation) |
| Optional LLM gateway requires customer BYO keys | Gateway is off by default; not a vendor LLM service | Accepted Risk |
| SOC 2 / formal audit | Process control; can be pursued after first paying customers | Deferred |

### Unverified concerns

- Real VS Code: extension-host activation and command execution after packaging fix.
- Actual file sync into Cursor/Kiro/Copilot/Amazon Q config folders.
- MCP server end-to-end startup against a real package.
- Docker production deploy, TLS termination, backup/restore, and Stripe webhook verification.
- Load, concurrency, and penetration testing of the server.
- Windows-specific extension and CLI behavior.

### Required manual / specialized testing before release

1. Build and install the `.vsix` in a clean VS Code: profile; activate and open the Hub panel.
2. Add a skill, sync to a test workspace, and verify files appear in the agent target folder.
3. Run `docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.prod.yml up --build` and exercise signup, login, org creation, API key creation, memory write, RAG query, and gateway proxy.
4. Perform a Postgres backup and restore drill.
5. Configure real Stripe, run a test checkout, and verify the webhook updates the org plan.
6. Run `npm audit` on both `package-lock.json` and `server/package-lock.json` until no runtime high/critical vulnerabilities remain.
7. Run a security review or light penetration test against the server's auth, RLS, and gateway routes.

### Readiness checklist

| Area | Extension Status | Server Status | Evidence |
|------|-----------------|---------------|----------|
| Build | Pass | Pass | `npm run build` / `npm run build` (server) |
| Type checking | Pass | Pass | `tsc` / `tsc --noEmit` (server) |
| Lint | Pass | Missing | Extension `npm run lint`; server has no lint script |
| Format | Pass | Missing | Extension `npm run format:check`; server has no format script |
| Unit tests | Pass | N/A | 38 tests pass |
| Integration tests | N/A | Pass | 26 server tests pass against Postgres |
| Packaging | Fail | N/A | `.vsix` missing `node_modules`; audit docs leak in |
| Security (access control) | N/A | Partial | RBAC/RLS code exists; RLS disabled by default |
| Security (input validation) | Partial | Partial | Path/arg validation in extension; Zod in server; dependency CVEs remain |
| Security (supply chain) | Fail | Fail | `mcp-proxy` via `npx`; `fast-uri`, `protobufjs`, `nodemailer`, `hono`, `ip-address` CVEs |
| Deployment / CI | Partial | Partial | Workflows exist; packaging validation missing; server lint missing |
| Monitoring / observability | Not Applicable | Missing | No Sentry, uptime alerts, or dashboards wired |
| Backup / disaster recovery | Not Applicable | Missing | Documented but not validated |
| Performance / scalability | Not Tested | Not Tested | Single-request smoke tests only |
| UX / accessibility | Not Tested | Not Tested | Web UIs not exercised manually |
| E2E / smoke tests | Fail | Partial | No extension-host smoke; server tests cover core flows but not production deploy |

---

*End of audit.*
