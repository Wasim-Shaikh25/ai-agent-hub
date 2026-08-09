# Release Blocker Fix Tracker

| FR | Task | Description | Status | Owner | Evidence / Notes |
|----|------|---------------|--------|-------|------------------|
| FR1 | T1.1 | Remove `--no-dependencies` from `package.json` `package` script | Done | Devin | `package.json` `package` now `vsce package` |
| FR1 | T1.2 | Update `.vscodeignore` to allow production `node_modules` and exclude dev/audit docs | Done | Devin | `node_modules/**` removed; dev docs excluded |
| FR1 | T1.3 | Add `.agents/`, `CHANGELOG.md`, `SECURITY.md`, `PRODUCTION_READINESS_AUDIT.md` to `.vscodeignore` | Done | Devin | Added to `.vscodeignore` |
| FR1 | T1.4 | Verify `.vsix` contains `node_modules/ajv/` and excludes audit files | Done | Devin | `unzip -l` shows `extension/node_modules/ajv/` and no dev/audit docs; `.vsix` size 532 KB |
| FR1 | T1.5 | Clean Extension Host activation test | Not started | TBD | Stub `require('./out/extension.js')` passes; clean VS Code: test pending |
| FR2 | T2.1 | Unsafe secret validation helper | Done | Devin | `assertSafeConfiguration()` added to `server/src/config.ts` |
| FR2 | T2.2 | Fail on unsafe defaults in production | Done | Devin | Throws in `production`; requires `ALLOW_INSECURE_DEFAULTS=true` for unsafe dev defaults |
| FR2 | T2.3 | Change `DEV_SEED` and `RLS_ENABLED` defaults | Done | Devin | `DEV_SEED` default `false`; `RLS_ENABLED` default `true` |
| FR2 | T2.4 | Update integration tests with safe test secrets | Done | Devin | `server/test/helpers.mjs` sets `NODE_ENV=test`, `JWT_SECRET`, `SUPERADMIN_PASSWORD` |
| FR2 | T2.5 | Unit tests for secret validation | Not started | TBD | Could add to `server/test/` |
| FR3 | T3.1 | `rlsEnabled` default `true` | Done | Devin | `server/src/config.ts` |
| FR3 | T3.2 | Verify `AsyncLocalStorage` org propagation | Done | Devin | Existing `server/src/db/pool.ts` path confirmed; RLS tests pass |
| FR3 | T3.3 | RLS tenant-isolation integration test | Done | Devin | `server/test/rls.test.mjs` 3/3 passes |
| FR4 | T4.1 | Record `server/npm audit` baseline | Not started | TBD | |
| FR4 | T4.2 | Update `fastify` to `>=5.11.3` | Not started | TBD | |
| FR4 | T4.3 | Update `nodemailer` | Not started | TBD | |
| FR4 | T4.4 | Remove or keep `@xenova/transformers` | Not started | TBD | Decision needed: embeddings provider default is `minilm` but optional dep still in tree |
| FR4 | T4.5 | Patch `@modelcontextprotocol/sdk` transitive deps | Not started | TBD | |
| FR4 | T4.6 | Re-run `npm audit` zero high/critical | Not started | TBD | |
| FR4 | T4.7 | Server typecheck/build/test pass | Done | Devin | `npm run typecheck`, `npm run build`, `npm test` all pass (26 tests) |
| FR5 | T5.1 | Add `mcp-proxy` dependency | Not started | TBD | |
| FR5 | T5.2 | Refactor `mcpManager.ts` to use installed binary | Not started | TBD | |
| FR5 | T5.3 | Validate `packageName` and args | Not started | TBD | |
| FR5 | T5.4 | Unit tests for MCP spawn | Not started | TBD | |
| FR6 | T6.1 | Enforce unique `type` + `name` in registry | Done | Devin | `assertUniqueName()` in `src/core/registry.ts` |
| FR6 | T6.2 | Return clear duplicate-name error | Done | Devin | Throws `A ${type} named "${name}" already exists` |
| FR6 | T6.3 | Registry duplicate unit tests | Done | Devin | `tests/core/registry.test.ts` duplicate add/update tests pass |
| FR7 | T7.1 | Add `npm run package` validation to CI | Not started | TBD | |
| FR7 | T7.2 | Add `npm audit --audit-level=high` to server CI | Not started | TBD | |
| FR7 | T7.3 | Add Postgres service to server CI | Not started | TBD | |
| FR8 | T8.1 | Multi-stage, non-root `server/Dockerfile` | Not started | TBD | |
| FR8 | T8.2 | Add `server/.dockerignore` | Not started | TBD | |
| FR8 | T8.3 | Local Docker build/health check | Not started | TBD | |
| FR9 | T9.1 | Register Fastify CSP plugin | Not started | TBD | |
| FR9 | T9.2 | Remove/Nonce inline scripts and styles | Not started | TBD | |
| FR10 | T10.1 | Align README command table with `package.json` | Not started | TBD | README still lists two unregistered commands (AUDIT-009) |
| FR10 | T10.2 | Document or replace YAML frontmatter parser | Not started | TBD | |
| TC | TC.1 | Update `PRODUCTION_READINESS_AUDIT.md` status | Not started | TBD | Do after all blockers addressed |
| TC | TC.2 | Root lint/build/test/format pass | Done | Devin | `npm run lint/build/test/format:check` all pass (41 tests) |
| TC | TC.3 | Server typecheck/build/test pass | Done | Devin | `npm run typecheck/build/test` all pass (26 tests) |

## Status key

- Not started: no work done
- In progress: assigned and being worked on
- Blocked: waiting for dependency or decision
- Done: implemented, tested, and evidence recorded
