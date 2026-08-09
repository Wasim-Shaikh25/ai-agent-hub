# Release Blocker Fix Tasks

Derived from `docs/release-blockers/requirements.md` and `PRODUCTION_READINESS_AUDIT.md`.

## FR1 — Extension package must activate in a clean VS Code: host

- [T1.1] Remove `--no-dependencies` from the `package` script in `package.json`.
- [T1.2] Update `.vscodeignore` so it no longer excludes the production `node_modules` tree but still excludes source maps, source `.ts`, tests, dev docs, and audit files.
- [T1.3] Add `.agents/`, `CHANGELOG.md`, `SECURITY.md`, and `PRODUCTION_READINESS_AUDIT.md` to `.vscodeignore`.
- [T1.4] Run `npm run package`, inspect `unzip -l ai-agent-hub-*.vsix`, and confirm `extension/node_modules/ajv/` is present and the excluded files are absent.
- [T1.5] In a clean Extension Host, install the `.vsix` and verify the extension activates without `Cannot find module 'ajv'`.

## FR2 — Server must refuse to start with unsafe default secrets

- [T2.1] Add a `src/config/validate.ts` (or inline in `src/config.ts`) that checks for unsafe default values of `JWT_SECRET`, `SUPERADMIN_PASSWORD`, and `DEV_API_KEY`.
- [T2.2] Make the validator throw/fail in production unless `ALLOW_INSECURE_DEFAULTS=true`.
- [T2.3] Change `DEV_SEED` default from `true` to `false` and `RLS_ENABLED` default from `false` to `true`.
- [T2.4] Update integration tests to set safe test secrets and `ALLOW_INSECURE_DEFAULTS=true`.
- [T2.5] Add unit tests for the validator covering missing, default, and safe values.

## FR3 — Row-Level Security must be production-default

- [T3.1] Set `rlsEnabled` default to `true` in `server/src/config.ts`.
- [T3.2] Verify `AsyncLocalStorage` org context is set before every query path that needs RLS.
- [T3.3] Add an integration test that proves query results are filtered by `org_id` when RLS is enabled.

## FR4 — Server runtime dependency CVEs must be patched

- [T4.1] Run `npm audit` in `server/` and record the baseline.
- [T4.2] Update `fastify` to `>=5.11.3` to resolve `fastify` and `find-my-way` advisories.
- [T4.3] Update `nodemailer` to a patched version.
- [T4.4] Decide whether `@xenova/transformers` is required for production embeddings. If not, remove it and default `EMBEDDINGS_PROVIDER=local`.
- [T4.5] Update or override `@modelcontextprotocol/sdk` transitive deps (`hono`, `ip-address`).
- [T4.6] Re-run `npm audit` and confirm zero high/critical runtime vulnerabilities.
- [T4.7] Run `npm run typecheck`, `npm run build`, and `npm test` after updates.

## FR5 — MCP runtime must be pinned

- [T5.1] Add `mcp-proxy` as an exact `dependency` in `package.json`.
- [T5.2] Refactor `src/core/mcpManager.ts` to resolve `mcp-proxy` from `require.resolve('mcp-proxy')` or `node_modules/.bin/mcp-proxy` and spawn without `shell: true`.
- [T5.3] Validate `packageName` and each argument with a safe allow-list.
- [T5.4] Add unit tests for argument validation and spawn arguments.

## FR6 — Extension registry must reject duplicate item names

- [T6.1] In `src/core/registry.ts`, check for an existing item with the same `type` + `name` in `addItem` and `updateItem`.
- [T6.2] Return a clear `Error` (`Duplicate name '${name}' for ${type}`) when a collision occurs.
- [T6.3] Add unit tests covering add and update collisions.

## FR7 — CI must validate packaging and activation

- [T7.1] Add a packaging step to `.github/workflows/build-and-test.yml` that runs `npm run package` and fails if `node_modules/` is missing from the `.vsix`.
- [T7.2] Add `npm audit --audit-level=high` to a server CI job.
- [T7.3] Add a Postgres service container to server CI so `npm test` runs against a real database.

## FR8 — Server Dockerfile must be production-hardened

- [T8.1] Rewrite `server/Dockerfile` with a `builder` stage (`npm ci`, `npm run build`) and a runtime stage (`npm ci --omit=dev`, `USER node`, `HEALTHCHECK`).
- [T8.2] Add `.dockerignore` to `server/`.
- [T8.3] Build the image locally and verify it starts and responds to `/health`.

## FR9 — Server web UI must serve a strict CSP

- [T9.1] Register a default CSP plugin in the Fastify instance.
- [T9.2] Extract inline `<script>` and `<style>` blocks in HTML templates to external files or use nonces.

## FR10 — Documentation and schemas must be consistent

- [T10.1] Remove or update README commands `AI Agent Hub: Add MCP Server` and `AI Agent Hub: Show MCP Servers` to match `package.json` `contributes.commands`.
- [T10.2] Document the YAML frontmatter parsing behavior or replace it with a compliant parser.

## Cross-cutting

- [TC.1] Update `PRODUCTION_READINESS_AUDIT.md` to mark resolved findings as closed and add evidence for each.
- [TC.2] Run root `npm run lint`, `npm run build`, `npm run test`, and `npm run format:check` before every commit.
- [TC.3] Run server `npm run typecheck`, `npm run build`, and `npm test` before every server commit.
