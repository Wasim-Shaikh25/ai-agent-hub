# Release Blocker Fix Tracker

| FR | Task | Description | Status | Owner | Evidence / Notes |
|----|------|---------------|--------|-------|------------------|
| FR-REV-1 | REV-1 | Supply safe secrets/flags in `deploy/docker-compose.yml` and `deploy/docker-compose.prod.yml` so `assertSafeConfiguration` does not crash documented flows | Done | Devin | Dev compose sets `JWT_SECRET`, `SUPERADMIN_PASSWORD`, `DEV_API_KEY` and `EMBEDDINGS_PROVIDER=local`; prod compose sets `NODE_ENV=production` and requires `JWT_SECRET`/`SUPERADMIN_PASSWORD` |
| FR-REV-2 | REV-2 | Fix `Registry` duplicate-name asymmetry by trimming/lowercasing on both store and compare sides | Done | Devin | `src/core/registry.ts` trims names on add/update and normalizes for comparison; `tests/core/registry.test.ts` covers whitespace/case duplicates |
| FR-REV-3 | REV-3 | Prevent `seedSuperadmin` from creating a superadmin with an empty password | Done | Devin | `server/src/db/migrate.ts` skips seeding when `SUPERADMIN_PASSWORD` is missing or shorter than 12 characters |
| FR-REV-4 | REV-4 | Remove `ALLOW_INSECURE_DEFAULTS=true` from `server/.env.example` and make shipped example env safe | Done | Devin | `server/.env.example` sets `ALLOW_INSECURE_DEFAULTS=false` and uses dev placeholders long enough to pass validation |
| FR1 | T1.1 | Remove `--no-dependencies` from `package.json` `package` script | Done | Devin | `package.json` `package` now `vsce package --dependencies` |
| FR1 | T1.2 | Update `.vscodeignore` to allow production `node_modules` and exclude dev/audit docs | Done | Devin | `node_modules/**/*.map` and `mcp-proxy` dev files excluded; dev/audit docs excluded |
| FR1 | T1.3 | Add `.agents/`, `CHANGELOG.md`, `SECURITY.md`, `PRODUCTION_READINESS_AUDIT.md` to `.vscodeignore` | Done | Devin | All dev/audit docs excluded from `.vsix` |
| FR1 | T1.4 | Verify `.vsix` contains `node_modules/ajv/` and `node_modules/mcp-proxy/` and excludes audit files | Done | Devin | `unzip -l` shows both runtime deps and no dev/audit docs; `.vsix` size 4.72 MB |
| FR1 | T1.5 | Clean Extension Host activation test | Done | Devin | `scripts/test-extension-host.sh` installs `.vsix` in a clean VS Code: profile and confirms `AI Agent Hub activated successfully` in Extension Host output |
| FR2 | T2.1 | Unsafe secret validation helper | Done | Devin | `assertSafeConfiguration()` in `server/src/config.ts` checks `JWT_SECRET`, `SUPERADMIN_PASSWORD`, `DEV_API_KEY` |
| FR2 | T2.2 | Fail on unsafe defaults in production | Done | Devin | Throws in `production`; `ALLOW_INSECURE_DEFAULTS=true` is only allowed in non-production |
| FR2 | T2.3 | Change `DEV_SEED` and `RLS_ENABLED` defaults | Done | Devin | `DEV_SEED` default `false`; `RLS_ENABLED` default `true` |
| FR2 | T2.4 | Update integration tests with safe test secrets | Done | Devin | `server/test/helpers.mjs` sets `NODE_ENV=test`, `JWT_SECRET`, `SUPERADMIN_PASSWORD` |
| FR2 | T2.5 | Unit tests for secret validation | Done | Devin | `server/test/config.test.mjs` tests production rejection and test/dev escape hatches |
| FR3 | T3.1 | `rlsEnabled` default `true` | Done | Devin | `server/src/config.ts` |
| FR3 | T3.2 | Verify `AsyncLocalStorage` org propagation | Done | Devin | Existing `server/src/db/pool.ts` path confirmed; RLS tests pass |
| FR3 | T3.3 | RLS tenant-isolation integration test | Done | Devin | `server/test/rls.test.mjs` 3/3 passes |
| FR4 | T4.1 | Record `server/npm audit` baseline | Done | Devin | `npm audit` in `server/` now reports `found 0 vulnerabilities` |
| FR4 | T4.2 | Update `fastify` to `>=5.11.3` | Done | Devin | `server/package.json` uses `fastify@^5.11.3`, `@fastify/cors@^11.3.0`, `@fastify/helmet@^13.1.0`, `@fastify/rate-limit@^11.2.0` |
| FR4 | T4.3 | Update `nodemailer` | Done | Devin | `server/package.json` uses `nodemailer@^9.0.5` |
| FR4 | T4.4 | Remove `@xenova/transformers` and default `EMBEDDINGS_PROVIDER` to `local` | Done | Devin | Optional dep removed from `server/package.json`; `server/src/config.ts` defaults to `local` embeddings |
| FR4 | T4.5 | Patch `@modelcontextprotocol/sdk` transitive deps | Done | Devin | `server/package.json` uses `@modelcontextprotocol/sdk@^1.30.0`; `npm audit` clean |
| FR4 | T4.6 | Re-run `npm audit` zero high/critical | Done | Devin | `server/` audit reports 0 vulnerabilities; root `npm audit --omit=dev` reports 0 production vulnerabilities |
| FR4 | T4.7 | Server typecheck/build/test pass | Done | Devin | `npm run typecheck`, `npm run build`, `npm test` all pass (26 tests) |
| FR5 | T5.1 | Add `mcp-proxy` dependency | Done | Devin | `package.json` has exact `mcp-proxy@6.7.0` |
| FR5 | T5.2 | Refactor `mcpManager.ts` to use installed binary | Done | Devin | `src/core/mcpManager.ts` resolves `mcp-proxy/dist/bin/mcp-proxy.mjs` via `createRequire` and spawns `node` with `shell: false` |
| FR5 | T5.3 | Validate `packageName` and args | Done | Devin | Existing `isValidNpmPackageName` and `isValidMcpArg` helpers used before spawn |
| FR5 | T5.4 | Unit tests for MCP spawn | Done | Devin | `tests/core/mcpManager.test.ts` starts the bundled `mcp-proxy` with a fake MCP server and asserts `running` state; `scripts/test-mcp-spawn.sh` provides an integration smoke test |
| FR6 | T6.1 | Enforce unique `type` + `name` in registry | Done | Devin | `assertUniqueName()` in `src/core/registry.ts` normalizes and compares trimmed lowercase names |
| FR6 | T6.2 | Return clear duplicate-name error | Done | Devin | Throws `A ${type} named "${name}" already exists` |
| FR6 | T6.3 | Registry duplicate unit tests | Done | Devin | `tests/core/registry.test.ts` covers add/update and whitespace/case duplicates |
| FR7 | T7.1 | Add `npm run package` validation to root CI | Done | Devin | `.github/workflows/ci.yml` packages `.vsix`, audits production deps, and verifies `ajv`/`mcp-proxy` present and audit/dev docs absent |
| FR7 | T7.2 | Add `npm audit` to server CI | Done | Devin | `.github/workflows/server-ci.yml` runs `npm audit --audit-level=moderate` |
| FR7 | T7.3 | Add Postgres service to server CI | Done | Devin | `.github/workflows/server-ci.yml` already includes `postgres` service |
| FR8 | T8.1 | Multi-stage, non-root `server/Dockerfile` | Done | Devin | `server/Dockerfile` uses `builder` + runtime stages, `npm ci --omit=dev`, `USER node`, `NODE_ENV=production`, `HEALTHCHECK` |
| FR8 | T8.2 | Add `server/.dockerignore` | Done | Devin | Created `server/.dockerignore` |
| FR8 | T8.3 | Local Docker build/health check | Done | Devin | `scripts/test-server-docker.sh` builds image, starts Postgres+Redis, and confirms container is `healthy` and `/health` returns 200 |
| FR9 | T9.1 | Register Fastify CSP plugin | Done | Devin | `server/src/index.ts` enables `contentSecurityPolicy` with `default-src 'self'`, `script-src 'self' 'unsafe-inline'`, etc. |
| FR9 | T9.2 | Nonce inline scripts and styles | Done | Devin | `@fastify/helmet` `enableCSPNonces: true` with `onSend` hook injecting nonces into `<script>` and `<style>` tags; inline event handlers still use `script-src-attr 'unsafe-inline'` until migrated |
| FR10 | T10.1 | Align README command table with `package.json` | Done | Devin | Removed two unregistered MCP commands from README command table in PR #16 |
| FR10 | T10.2 | Document or replace YAML frontmatter parser | Not started | TBD | Design concern; scheduled post-release |
| TC | TC.1 | Update `PRODUCTION_READINESS_AUDIT.md` status | Done | Devin | Executive summary, finding summary, major risks, command results, and missing gaps updated to reflect PR #17 fixes |
| TC | TC.2 | Root lint/build/test/format pass | Done | Devin | `npm run lint/build/test/format:check` all pass (45 tests) |
| TC | TC.3 | Server typecheck/build/test pass | Done | Devin | `npm run typecheck/build/test` all pass (32 tests) |

## Status key

- Not started: no work done
- In progress: assigned and being worked on
- Blocked: waiting for dependency or decision
- Done: implemented, tested, and evidence recorded
- Partial: implemented but still needs a follow-up step (e.g. real integration test)
