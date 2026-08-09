# Release Blocker Fix Requirements

## Background

The `main` branch currently contains the merged VS Code: extension (`v0.0.7`) and the `hub-server` (`v0.1.0`). The `PRODUCTION_READINESS_AUDIT.md` issued a **STOP — DO NOT GO** recommendation. Before any public release or marketplace publish, the issues below must be fixed.

## In-scope

This document covers the immediate release blockers and required pre-release work identified in `PRODUCTION_READINESS_AUDIT.md`. Out of scope are post-release product features (RL learning, hosted SaaS activation, Stripe billing setup, SOC 2 process).

## Functional Requirements

### FR1 — Extension package must activate in a clean VS Code: host

- The packaged `.vsix` must contain all runtime dependencies required by `out/**/*.js`.
- The `.vsix` must not bundle source code, development artifacts, audit documents, or task trackers.
- A clean VS Code: Extension Host must activate the extension and show the Hub webview without `Cannot find module` errors.

### FR2 — Server must refuse to start with unsafe default secrets

- If `JWT_SECRET`, `SUPERADMIN_PASSWORD`, or `DEV_API_KEY` is unset or equal to a documented unsafe default, the server must fail to start in production (`NODE_ENV=production`).
- In development/test, unsafe defaults may be allowed only when an explicit `ALLOW_INSECURE_DEFAULTS=true` flag is set.
- `DEV_SEED` must default to `false` and `RLS_ENABLED` must default to `true`.

### FR3 — Row-Level Security must be production-default

- `config.rlsEnabled` defaults to `true`.
- All queries that set `app.current_org` continue to propagate the org context via `AsyncLocalStorage`.
- Integration tests exercise RLS by default and verify tenant isolation.

### FR4 — Server runtime dependency CVEs must be patched

- `npm audit` in `server/` reports no high or critical CVEs reachable in the production runtime path.
- Vulnerable packages are updated, replaced, or removed (`fastify`/`find-my-way`, `nodemailer`, `@xenova/transformers`, `@modelcontextprotocol/sdk` transitive deps).
- `sharp` and `protobufjs` via `@xenova/transformers` are eliminated unless embeddings are explicitly enabled.

### FR5 — MCP runtime must be pinned and not fetched by unpinned `npx`

- `mcp-proxy` is declared as an exact-version dependency in the extension `package.json`.
- `src/core/mcpManager.ts` resolves and spawns the installed binary instead of `npx mcp-proxy`.
- Shell execution is disabled and arguments are validated against a safe allow-list.

### FR6 — Extension registry must reject duplicate item names

- `Registry.addItem` and `Registry.updateItem` enforce unique `name` values per type.
- Attempting to add or rename to an existing name returns a clear error and does not overwrite files.

### FR7 — CI must validate packaging and activation

- The root `build-and-test` workflow runs `npm run package` and a lightweight packaging check.
- Server CI includes `npm audit --audit-level=high` and a Postgres-backed `npm test`.

### FR8 — Server Dockerfile must be production-hardened

- Multi-stage build with `npm ci --omit=dev` in the runtime stage.
- Non-root `USER node`, `NODE_ENV=production`, and a `HEALTHCHECK`.
- Only `package.json`, `package-lock.json`, and `dist/` are copied into the runtime stage.

### FR9 — Server web UI must serve a strict Content-Security-Policy

- Fastify registers a default CSP header.
- Inline scripts and styles are removed or nonced/hashed.

### FR10 — Documentation and schemas must be internally consistent

- README command table matches `package.json` `contributes.commands`.
- YAML frontmatter parser behavior is documented or replaced with a standard parser.

## Non-functional Requirements

- All existing lint, build, and test commands must continue to pass.
- Every fix must include or update automated tests where applicable.
- The `PRODUCTION_READINESS_AUDIT.md` status for resolved findings is updated with evidence.
