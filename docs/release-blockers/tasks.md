# Release Blocker Fix Tasks

Derived from `docs/release-blockers/requirements.md` and `PRODUCTION_READINESS_AUDIT.md`.

## FR1 — Extension package must activate in a clean VS Code: host

- [x] [T1.1] Update `package.json` `package` script to `vsce package --dependencies`.
- [x] [T1.2] Update `.vscodeignore` to allow production `node_modules` while excluding source maps, source `.ts`, tests, dev docs, and audit files.
- [x] [T1.3] Add `.agents/`, `CHANGELOG.md`, `SECURITY.md`, `PRODUCTION_READINESS_AUDIT.md` to `.vscodeignore`.
- [x] [T1.4] Run `npm run package`, inspect `unzip -l ai-agent-hub-*.vsix`, and confirm `extension/node_modules/ajv/` and `extension/node_modules/mcp-proxy/` are present and excluded files are absent.
- [x] [T1.5] In a clean Extension Host, install the `.vsix` and verify the extension activates without `Cannot find module 'ajv'`.

## FR2 — Server must refuse to start with unsafe default secrets

- [x] [T2.1] Add `assertSafeConfiguration()` in `server/src/config.ts` that checks `JWT_SECRET`, `SUPERADMIN_PASSWORD`, and `DEV_API_KEY`.
- [x] [T2.2] Make the validator throw in production and only allow `ALLOW_INSECURE_DEFAULTS=true` in non-production.
- [x] [T2.3] Change `DEV_SEED` default from `true` to `false` and `RLS_ENABLED` default from `false` to `true`.
- [x] [T2.4] Update integration tests to set safe test secrets and `NODE_ENV=test`.
- [x] [T2.5] Add unit tests for the validator covering missing, default, and safe values.

## FR3 — Row-Level Security must be production-default

- [x] [T3.1] Set `rlsEnabled` default to `true` in `server/src/config.ts`.
- [x] [T3.2] Verify `AsyncLocalStorage` org context is set before every query path that needs RLS.
- [x] [T3.3] Confirm existing integration tests prove query results are filtered by `org_id` when RLS is enabled.

## FR4 — Server runtime dependency CVEs must be patched

- [x] [T4.1] Record `server/npm audit` baseline.
- [x] [T4.2] Update `fastify` to `>=5.11.3` and compatible plugin versions.
- [x] [T4.3] Update `nodemailer` to a patched version.
- [x] [T4.4] Remove `@xenova/transformers` and default `EMBEDDINGS_PROVIDER` to `local`.
- [x] [T4.5] Update `@modelcontextprotocol/sdk` to a patched version.
- [x] [T4.6] Re-run `npm audit` and confirm zero high/critical runtime vulnerabilities.
- [x] [T4.7] Run `npm run typecheck`, `npm run build`, and `npm test` after updates.

## FR5 — MCP runtime must be pinned

- [x] [T5.1] Add `mcp-proxy` as an exact `dependency` in `package.json`.
- [x] [T5.2] Refactor `src/core/mcpManager.ts` to resolve the `mcp-proxy` binary and spawn without `shell: true`.
- [x] [T5.3] Validate `packageName` and each argument with a safe allow-list.
- [x] [T5.4] Add end-to-end test for MCP spawn.

## FR6 — Extension registry must reject duplicate item names

- [x] [T6.1] In `src/core/registry.ts`, check for an existing item with the same `type` + normalized `name` in `addItem` and `updateItem`.
- [x] [T6.2] Return a clear `Error` (`A ${type} named "${name}" already exists`) when a collision occurs.
- [x] [T6.3] Add unit tests covering add, update, and whitespace/case collisions.

## FR7 — CI must validate packaging and activation

- [x] [T7.1] Add a packaging step to `.github/workflows/ci.yml` that runs `npm run package` and fails if `node_modules/ajv` or `node_modules/mcp-proxy` are missing from the `.vsix`.
- [x] [T7.2] Add `npm audit` to `.github/workflows/server-ci.yml`.
- [x] [T7.3] Confirm Postgres service in server CI is present and migrations/tests run against it.

## FR8 — Server Dockerfile must be production-hardened

- [x] [T8.1] Rewrite `server/Dockerfile` with a `builder` stage (`npm ci`, `npm run build`) and a runtime stage (`npm ci --omit=dev`, `USER node`, `HEALTHCHECK`).
- [x] [T8.2] Add `server/.dockerignore`.
- [x] [T8.3] Build the image locally and verify it starts and responds to `/health`.

## FR9 — Server web UI must serve a CSP

- [x] [T9.1] Register a `contentSecurityPolicy` in the Fastify instance.
- [x] [T9.2] Use per-request CSP nonces for inline `<script>` and `<style>` blocks via `@fastify/helmet` and an `onSend` hook.

## FR10 — Documentation and schemas must be consistent

- [x] [T10.1] Remove README commands `AI Agent Hub: Add MCP Server` and `AI Agent Hub: Show MCP Servers` to match `package.json` `contributes.commands`.
- [ ] [T10.2] Document the YAML frontmatter parsing behavior or replace it with a compliant parser.

## Cross-cutting

- [x] [TC.1] Update `PRODUCTION_READINESS_AUDIT.md` to mark resolved findings as closed and add evidence for each.
- [x] [TC.2] Run root `npm run lint`, `npm run build`, `npm run test`, and `npm run format:check` before every commit.
- [x] [TC.3] Run server `npm run typecheck`, `npm run build`, and `npm test` before every server commit.
