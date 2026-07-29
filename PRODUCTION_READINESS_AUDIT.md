# AI Agent Hub — Production Readiness Audit

**Repository:** `Wasim-Shaikh25/ai-agent-hub`  
**Assessed commit:** `c94323f` (`v0.0.6`) on `main`  
**Audit date:** 2026-07-29  
**Auditor:** Devin (cross-functional review)  

---

## Executive Summary

AI Agent Hub is a VS Code extension that centralizes AI behavior content (skills, rules, hooks, workflows, personas) and syncs it to multiple AI agent target folders (Cursor, Kiro, GitHub Copilot, Amazon Q, etc.). It also supports running local MCP servers via `mcp-proxy` and generating rule files so agents can call them.

The codebase has progressed significantly since the earlier `DUE_DILIGENCE_REVIEW.md` (`7c14395`). The previously identified P0 launch blockers have largely been addressed:

- `activationEvents` are now declared for all commands plus `onStartupFinished`.
- MCP server spawning uses `shell: false` and validates package names / arguments.
- Path traversal is mitigated by `PathUtils.resolveSafeTarget` and `isUnsafePath`.
- A test suite (38 tests) now passes.
- Lint, TypeScript build, and Prettier formatting all pass.
- A `.vscodeignore` and `LICENSE` are in place, and `vsce package` completes without warnings.

However, the **produced `.vsix` is missing runtime dependencies** (`ajv` is declared as a dependency but is not bundled, and `mcp-proxy` is not declared at all). An end user installing the current package would see an activation failure and a non-functional MCP feature. In addition, `npm audit` reports vulnerable transitive dependencies, including a runtime-reachable `fast-uri` issue via `ajv`.

**Final recommendation:** **STOP — CONDITIONAL GO**

Do not publish the extension publicly until the packaging / runtime-dependency and vulnerable-dependency issues are resolved and a clean extension-host smoke test has been performed.

### Finding summary

| Severity | Count | Examples |
|----------|-------|----------|
| Critical | 1 | Packaged `.vsix` lacks runtime dependencies (`ajv`) |
| High | 2 | MCP runtime not packaged / pinned; vulnerable `fast-uri` via `ajv` |
| Medium | 4 | Dev dependency CVEs; duplicate item names overwrite files; no E2E smoke; remote hub update overwrites bundled files |
| Low | 3 | README/command mismatch; non-YAML frontmatter parser; MCP port conflict detection is config-only |

### Major technical risks

1. **Packaging defect:** `npx vsce package --no-dependencies` creates a `.vsix` with no `node_modules`, but `out/core/validator.js` requires `ajv` at activation.
2. **MCP supply chain / runtime:** `mcp-proxy` and target MCP packages are fetched on demand by `npx` with no version pinning, no offline support, and no runtime dependency lockfile.
3. **Vulnerable transitive dependencies:** `fast-uri@3.1.0` (via `ajv@8.20.0`) and multiple dev-dependency CVEs are present.
4. **No runtime validation:** All checks are static/unit; the packaged extension and real VS Code host were not exercised in this audit.
5. **Data integrity during sync:** Two enabled items with the same name generate the same file slug; the second overwrites the first without warning.

### Scope limitations and untested areas

- The extension was **not installed or run in a real VS Code Extension Host**.
- **Real file sync to Cursor, Kiro, Copilot, or Amazon Q folders** was not tested.
- **MCP server end-to-end startup** (against `@modelcontextprotocol/server-filesystem` or similar) was not tested.
- Marketplace packaging, publishing, and upgrade scenarios were not tested.
- Windows path handling and network-failure paths were inferred from code rather than observed.
- Accessibility, performance, and load testing were not performed (local dev tool with small data sets).

### Conditions required for release

1. Fix `.vsix` packaging so that runtime dependencies are either bundled (webpack/esbuild) or shipped via `vsce` dependencies.
2. Decide whether MCP ships in v1. If yes, add and pin `mcp-proxy` (and any required MCP server packages) as dependencies and test startup.
3. Update `ajv` / transitive `fast-uri` to patched versions and run `npm audit` until runtime-reachable CVEs are clean.
4. Add a CI packaging-validation step (e.g., extract `.vsix` and confirm `node_modules/ajv` exists, or verify a single bundled `extension.js` includes `ajv`).
5. Perform at least one manual VS Code Extension Host smoke test: install the `.vsix`, activate the extension, open the Hub panel, add a skill, and sync to a test workspace.

---

## Product Context and Audit Coverage

### Discovered product purpose and requirements

- **Purpose:** A local, single-user "CMS" for AI behavior content. Users author skills, rules, hooks, workflows, and personas once and push them to the configuration folders used by their AI coding assistants.
- **Target users:** Individual developers and small teams who use more than one AI editor/assistant.
- **Roles:** There is one user role. The extension runs with the user's OS privileges; there is no authentication, RBAC, multi-tenancy, or SaaS backend.
- **Critical workflows:**
  1. Install extension → activate.
  2. Run setup → detect or manually add agent targets.
  3. Create/edit/toggle content items.
  4. Sync enabled content to agent target folders.
  5. (Optional) Register and start an MCP server; sync generated rule files.
- **Sensitive data handled:** Local workspace paths, user-authored prompt content, MCP environment variables (stored in VS Code Memento as plaintext), and remote git credentials for the builtin content update.
- **External integrations:** `git` CLI for updating builtin content from GitHub; `npx` for MCP server packages; the VS Code Extension API.

### Architecture and trust boundaries

- **Applications / services:** One VS Code extension (`main: out/extension.js`).
- **Entry points:** `activate()` in `src/extension.ts`; eight registered commands.
- **Pages / UI:** `HubPanel` webview (`src/ui/hubPanel.ts`) and `SetupPanel` webview (`src/ui/setupPanel.ts`).
- **State management:** VS Code `Memento` (`workspaceState`/`globalState`) wrapped by `Storage`; in-memory `Registry`; file-system writes via `FileWriter`; child processes via `McpManager`.
- **Trust boundaries:**
  - The extension has full local file-system access, so the primary trust assumption is that the user controls the workspace and the content they sync.
  - Sync writes are constrained to a base path (`workspaceRoot` for agent targets, `repo.repoPath` for repo-level sync) by `PathUtils`.
  - MCP servers run as child processes; the extension validates package names and arguments but still executes arbitrary npm packages selected by the user.

### Files, routes, APIs, and modules reviewed

- `package.json`, `tsconfig.json`, `vitest.config.ts`, `.eslintrc.cjs`, `.prettierrc`, `.vscodeignore`
- `src/extension.ts`
- `src/core/{syncEngine,registry,validator,fileWriter,agentConfig,agentDetector,mcpManager,mcpStore,repoSyncStore,storage,hubUpdater,types}.ts`
- `src/ui/{hubPanel,setupPanel,webviewHtml}.ts`
- `src/commands/{addSkill,addRule,addHook,openHub,setupAgents,syncToAgents,showAgents}.ts`
- `src/utils/{pathUtils,mcpEnv,promptContent,logger}.ts`
- `tests/**/*.test.ts`, `__mocks__/vscode.ts`
- `schemas/*.schema.json`
- `hub-content/` demo content
- `.github/workflows/ci.yml`, `.github/workflows/release.yml`
- `README.md`, `DUE_DILIGENCE_REVIEW.md`, `REQUIREMENTS_AND_FIX_PLAN.md`

### Commands and tests executed

| Check | Command | Result |
|-------|---------|--------|
| Lint | `npm run lint` | Pass (exit 0) |
| TypeScript build | `npm run build` | Pass (exit 0) |
| Unit tests | `npm test` | Pass — 38 tests in 6 files |
| Format check | `npm run format:check` | Pass |
| VSIX package | `npx vsce package --no-dependencies` | Pass but `.vsix` lacks `node_modules` |
| Dependency audit | `npm audit --audit-level=moderate` | 12 vulnerabilities (1 critical, 9 high, 2 moderate) |
| VSIX contents | `unzip -l ai-agent-hub-0.0.6.vsix` | `out/`, `hub-content/`, `schemas/`, `package.json`, `README.md`, `LICENSE.txt`; no `node_modules` |
| Runtime require check | `grep -n 'require("ajv")' out/core/validator.js` | Confirms compiled code requires `ajv` |

### Assumptions, contradictions, exclusions, and limitations

- **Assumptions:** The product is intended as a single-user local tool; enterprise features (SSO, RBAC, team sharing) are out of scope.
- **Contradictions resolved:** Earlier `README` referred to an `agents/` folder; current code and README now use `persona`/`personas/`. The `REQUIREMENTS_AND_FIX_PLAN.md` P0 items are mostly addressed.
- **Contradictions remaining:** README lists commands `AI Agent Hub: Add MCP Server` and `AI Agent Hub: Show MCP Servers` that are not registered in `package.json` (low).
- **Exclusions:** Real VS Code host testing, marketplace publishing, Windows-specific behavior, performance/load testing, and penetration testing were not performed.

---

## Product Completeness Assessment

### Role-to-Capability Matrix

| Role | Create Content | Manage Agents | Sync | Manage MCP | View Results |
|------|---------------|---------------|------|------------|--------------|
| Local Developer | Implemented | Implemented | Implemented | Implemented | Implemented (Hub panel + Output) |

There is one user role. No admin, support, or read-only roles are required for a local dev tool.

### Entity-to-Operation Matrix

| Entity | Create | View | List | Update | Delete | Toggle | Search/Filter | Import/Export | Notes |
|--------|--------|------|------|--------|--------|--------|---------------|---------------|-------|
| Skill | Implemented | Implemented | Implemented | Implemented | Implemented | Implemented | Missing | Missing | |
| Rule | Implemented | Implemented | Implemented | Implemented | Implemented | Implemented | Missing | Missing | |
| Hook | Implemented | Implemented | Implemented | Implemented | Implemented | Implemented | Missing | Missing | Trigger metadata only |
| Workflow | Implemented | Implemented | Implemented | Implemented | Implemented | Implemented | Missing | Missing | |
| Persona | Implemented | Implemented | Implemented | Implemented | Implemented | Implemented | Missing | Missing | |
| Agent Target Config | Implemented | Implemented | Implemented | Implemented | Implemented | Implemented | Missing | Missing | |
| Repo Sync Target | Implemented | Implemented | Implemented | Implemented | Implemented | Implemented | Missing | Missing | |
| MCP Server Config | Implemented | Implemented | Implemented | Missing* | Implemented | N/A | Missing | Missing | *No update UI/command |

*Improvement opportunities:* search/filter, import/export, and duplicate-name prevention would improve usability but are not release blockers for an MVP.

### Workflow Completeness Matrix

| Workflow | Start | Input Validation | Happy Path | Status Visibility | Failure Handling | Cancellation | Retry | Notifications | History/Audit | Admin | Verdict |
|----------|-------|------------------|------------|---------------------|------------------|--------------|-------|---------------|---------------|-------|---------|
| Setup agent targets | Command palette / Hub panel | PathUtils validation + schema validation | Save config | Config list updated | Validation errors posted back to webview | Cancel button | Re-run setup | Toast + inline status | Config persisted | N/A | Implemented |
| Create/edit content | Hub panel + commands | Non-empty name, hook trigger, schema validation | Item saved to Registry | Item list refreshed | Error toast | Cancel form | Re-add/edit | Toast | Stored in Memento | N/A | Implemented |
| Sync to agents | Hub panel + command | Confirmation modal (optional), safe path resolution | Files written | Sync tab result | Per-agent errors collected | Decline modal | Re-sync | Toast | `lastSyncResult` persisted | N/A | Implemented |
| Register/start MCP | Hub panel | Package/arg/env validation | Process spawned, status updated | MCP list status | Error state in UI | Stop button | Re-start | Toast + status bar | State map in memory | N/A | Implemented (runtime packaging broken) |
| Update builtin content | Automatic on sync | N/A | `hub-content/` overwritten from remote | No UI feedback beyond warning on failure | Warning message, falls back to local | N/A | Next sync | Warning | N/A | N/A | Implemented |

### Dashboard and Reporting Matrix

| Dashboard | Exists? | Notes |
|-----------|---------|-------|
| Main Hub panel (skills/rules/hooks/workflows/personas/agents/mcp/sync tabs) | Yes | Serves as the primary user dashboard |
| Setup wizard/panel | Yes | Agent and repo target configuration |
| Sync result view | Yes | Per-agent/per-repo results in the Sync tab |
| MCP status panel | Yes | List of registered MCP servers with status |
| User/admin reports or exports | No | Not required for local single-user tool |

### Missing requirements and discovery gaps

1. **E2E / smoke validation in CI** — Missing. The unit-test suite does not verify that a packaged `.vsix` can actually activate in VS Code.
2. **Duplicate item-name guard** — Missing. Two enabled items with the same name overwrite each other on sync.
3. **Search / filter / bulk operations** — Not implemented; nice-to-have for users with many items.
4. **Import / export of Hub content** — Not implemented. Would help backup/team sharing.
5. **MCP server update** — No UI to edit an existing MCP server config.
6. **YAML-compliant frontmatter parser** — `Registry` uses a simple line split, which does not match the README's "YAML front matter" description.

### Product decisions required

1. **Packaging strategy:** Should runtime dependencies be bundled into `out/extension.js` (recommended for size/reliability) or shipped as `node_modules` in the `.vsix`?
2. **MCP in MVP:** Should MCP server hosting be part of the initial public release, or removed/disabled until it is fully packaged and tested?
3. **Remote builtin updates:** Should the extension overwrite its own installed `hub-content/` from GitHub on every sync, or store updated builtins in `globalStorage` and leave bundled files untouched?
4. **Duplicate names:** Should the extension reject duplicate item names, or disambiguate file names automatically?
5. **Telemetry / crash reporting:** Should the extension collect anonymous activation/crash data, or remain telemetry-free?

---

## Detailed Findings

### AUDIT-001 — Packaged `.vsix` is missing runtime dependencies

- **Classification:** Confirmed Defect
- **Severity:** Critical
- **Category:** Packaging / Deployment
- **Disposition:** Open — Release Blocker
- **Release impact:** A public `.vsix` built with the current script will fail to activate because `require("ajv")` cannot be resolved.
- **Affected roles:** All end users installing the published extension.
- **Affected files/locations:**
  - `package.json` (`"dependencies": { "ajv": "^8.12.0" }`)
  - `package.json` (`"scripts": { "package": "vsce package --no-dependencies" }`)
  - `out/core/validator.js:40` (`const ajv_1 = __importDefault(require("ajv"));`)
  - `.github/workflows/release.yml:63` (`npx vsce package --no-dependencies -o ai-agent-hub.vsix`)
- **Evidence and reproduction:**
  ```bash
  npm run package
  unzip -l ai-agent-hub-0.0.6.vsix
  ```
  Output shows `extension/out/...` and `extension/package.json` but no `node_modules/`. The compiled `out/core/validator.js` top-level-requires `ajv`.
- **Root cause:** `vsce package --no-dependencies` intentionally omits `node_modules`, and there is no bundler (webpack/esbuild) to inline dependencies into the emitted JavaScript.
- **Technical / user / business impact:** Extension activation crash on install. Users cannot use the product at all. Marketplace reviews would be negative.
- **Likelihood:** Certain for any user installing the current package.
- **Recommended solution:**
  - Option A (simpler): remove `--no-dependencies` from `package.json` and `release.yml` so that `vsce` installs and ships production `dependencies` in the `.vsix`. Ensure `mcp-proxy` is added to `dependencies` if MCP is to ship.
  - Option B (cleaner): add a bundler (e.g., `esbuild`) to produce a single `out/extension.js` with all runtime dependencies inlined. Update `.vscodeignore` and `package.json` `main` accordingly.
- **Regression risks:** Bundled output is harder to debug; shipping `node_modules` increases `.vsix` size.
- **Tests to add:** CI step that extracts the packaged `.vsix` and verifies `node_modules/ajv` exists **or** that `out/extension.js` contains no external `require` calls for missing packages.
- **Verification steps:**
  1. Run `npm run package`.
  2. Unzip `.vsix` and confirm `extension/node_modules/ajv` (or a self-contained `out/extension.js`).
  3. Install the `.vsix` in a clean VS Code profile and confirm the extension activates without `Cannot find module 'ajv'`.
- **Similar locations to inspect:** Any other runtime `dependencies` added in the future must be included in the packaged output.

### AUDIT-002 — MCP server runtime is not packaged or pinned

- **Classification:** Confirmed Defect
- **Severity:** High
- **Category:** Security / Reliability / Deployment
- **Disposition:** Open — Release Blocker (if MCP ships in MVP)
- **Release impact:** The MCP feature is non-functional in the packaged extension and reaches out to npm at runtime with no version pinning.
- **Affected roles:** Users who try to register an MCP server.
- **Affected files/locations:**
  - `src/core/mcpManager.ts:45-74`
  - `package.json` (no `mcp-proxy` dependency)
  - `src/ui/hubPanel.ts:277-295` (MCP add form)
- **Evidence:**
  - `grep -i "mcp-proxy" package.json package-lock.json` returns no results.
  - `McpManager.start` executes `npx mcp-proxy --port <port> -- npx <packageName> ...args`.
- **Root cause:** `mcp-proxy` and the target MCP packages are treated as external runtime utilities rather than declared, version-pinned dependencies.
- **Impact:**
  - **Security:** `npx` installs the latest `mcp-proxy` and the selected MCP package at runtime, bypassing the `package-lock.json` supply-chain guarantees.
  - **Reliability:** No offline support; version drift; possible breaking changes in `mcp-proxy`.
  - **Functionality:** Packaged extension cannot start MCP servers unless the user has network access and `npx` can install packages.
- **Likelihood:** Certain for packaged users; high for any user without network.
- **Recommended solution:**
  1. Add `mcp-proxy` to `dependencies` with an exact version (e.g., `"mcp-proxy": "<pinned>"`).
  2. Change `McpManager.start` to invoke the resolved `mcp-proxy` binary from `node_modules/.bin/mcp-proxy` (or via a bundled executable) instead of `npx`.
  3. If inner MCP packages must be user-selectable, document that they are downloaded on demand and require network; or pre-declare supported packages.
  4. If MCP is not ready for v1, remove its UI/commands and defer it.
- **Regression risks:** Adding `mcp-proxy` may significantly increase `.vsix` size; bundle it if size is a concern.
- **Tests to add:**
  - Add an integration test that starts a tiny mock MCP server through `McpManager` and verifies the proxy port responds.
  - Add a packaging test that confirms `mcp-proxy` is present in the `.vsix` if MCP is enabled.
- **Verification steps:**
  1. Add `mcp-proxy` as a dependency and package the extension.
  2. Install `.vsix` offline and register `@modelcontextprotocol/server-filesystem`.
  3. Click Start and verify `http://localhost:<port>/mcp` responds.
- **Similar locations to inspect:** Any future subprocess spawning should use resolved, version-locked binaries.

### AUDIT-003 — Vulnerable transitive runtime dependency `fast-uri` via `ajv`

- **Classification:** Probable Risk
- **Severity:** High
- **Category:** Security / Dependencies
- **Disposition:** Open — Required Before Release
- **Release impact:** A runtime dependency with known path-traversal and host-confusion CVEs is shipped to end users.
- **Affected roles:** All users.
- **Affected files/locations:**
  - `package.json` (`"ajv": "^8.12.0"` resolves to `ajv@8.20.0`)
  - `node_modules/fast-uri@3.1.0`
  - `src/core/validator.ts` (uses `ajv`)
- **Evidence:**
  ```bash
  npm ls fast-uri
  # ai-agent-hub@0.0.6
  # └─┬ ajv@8.20.0
  #   └── fast-uri@3.1.0
  ```
  `npm audit` reports:
  - `fast-uri <=3.1.3` — path traversal via percent-encoded dot segments, host confusion via percent-encoded authority delimiters.
- **Root cause:** `ajv@8.20.0` depends on a vulnerable `fast-uri` version. The `package-lock.json` locks the vulnerable version.
- **Impact:** `ajv` uses `fast-uri` for URI resolution when compiling/validating schemas. The Validator only loads trusted local schemas, so direct exploitation through user data is unlikely, but the dependency is still vulnerable and may be flagged by security scanners.
- **Likelihood:** Low for active exploit (trusted schemas only), but high for compliance / scanner failure.
- **Recommended solution:**
  1. Run `npm update ajv` to get the latest patched `fast-uri` transitive.
  2. If `ajv` cannot be updated quickly, add an `overrides` entry in `package.json`:
     ```json
     "overrides": {
       "fast-uri": ">=3.1.4"
     }
     ```
  3. Re-run `npm audit` and `npm test`.
- **Regression risks:** Updating `ajv` may change validation error messages; tests should be re-run.
- **Tests to add:** None specific, but run the existing `registry.test.ts` and `syncEngine.test.ts` after updating.
- **Verification steps:**
  1. `npm update ajv` (or add override).
  2. `npm audit` should no longer flag `fast-uri`.
  3. `npm test` and `npm run build` pass.

### AUDIT-004 — Dev and build dependency vulnerabilities

- **Classification:** Probable Risk
- **Severity:** Medium
- **Category:** Supply Chain / DevOps
- **Disposition:** Open — Required Before Release
- **Release impact:** Compromised build tools could affect the generated `.vsix`.
- **Affected roles:** Developers and CI.
- **Affected files/locations:** `package-lock.json`; `node_modules/{vitest,postcss,undici,tmp,brace-expansion,form-data,qs,linkify-it,markdown-it}/`
- **Evidence:** `npm audit` reports 12 total vulnerabilities, including:
  - `vitest <3.2.6` — critical arbitrary file read/execute when UI server is listening.
  - `postcss <=8.5.17` — path traversal in source-map auto-loading.
  - `undici 7.0.0-7.27.2` — multiple HTTP/TLS/COOP issues.
  - `linkify-it / markdown-it` via `@vscode/vsce <=3.0.0`.
- **Root cause:** Outdated transitive dev dependencies.
- **Impact:**
  - `vitest` critical is mitigated because CI uses `vitest --run` (no UI server), but it still poses a risk to local development.
  - `vsce` (via `markdown-it/linkify-it`) runs in CI and could be affected by malicious README content if the README were attacker-controlled.
  - Other packages are transitive of build/test tools.
- **Likelihood:** Medium for dev environment; low for runtime because these are not shipped to end users.
- **Recommended solution:**
  1. Update `@vscode/vsce` to a patched version (>=3.9.2) to fix `markdown-it`/`linkify-it`.
  2. Update `vitest` to >=3.2.6.
  3. Run `npm audit fix` and review each change; rerun `npm test`, `npm run build`, and `npm run package`.
- **Regression risks:** Updated build tools may change lint/format behavior or package output; test all gates.
- **Tests to add:** Add a CI packaging-validation step.
- **Verification steps:**
  1. `npm audit` returns zero moderate+ vulnerabilities or only clearly non-runtime ones.
  2. All existing checks pass.

### AUDIT-005 — Duplicate item names can overwrite each other on sync

- **Classification:** Confirmed Defect
- **Severity:** Medium
- **Category:** Data Integrity
- **Disposition:** Open — Required Before Release
- **Release impact:** A user can silently lose content when two enabled items share the same name.
- **Affected roles:** Content authors.
- **Affected files/locations:**
  - `src/core/registry.ts:90-112` (`addItem`)
  - `src/core/registry.ts:119-131` (`updateItem`)
  - `src/core/fileWriter.ts:49-71` (slugify + write)
- **Evidence:** `FileWriter` computes `slug = slugify(item.name)` and writes `path.join(targetDir, `${slug}.${ext}`)`. The Registry does not enforce unique `name` within a type.
- **Root cause:** No uniqueness check and no file-name disambiguation.
- **Impact:** Two enabled skills named "Clean Code" both write `clean-code.md`; the second write clobbers the first. The user sees only one file and may believe content was deleted.
- **Likelihood:** Medium. Users may reuse common names.
- **Recommended solution:**
  - In `Registry.addItem` and `updateItem`, reject a name if an existing item of the same type already has that name (case-insensitive, after slugify).
  - Or, in `FileWriter`, append a short id/hash to the slug when a collision is detected.
- **Regression risks:** Backward compatibility for existing duplicate names if any.
- **Tests to add:**
  - `registry.test.ts`: adding two skills with the same name throws.
  - `fileWriter.test.ts`: two items with the same slug produce distinct file paths.
- **Verification steps:**
  1. Add two skills both named "Test".
  2. Sync and verify two distinct files are written or an error is shown.

### AUDIT-006 — No end-to-end or extension-host validation

- **Classification:** Confirmed Missing Requirement
- **Severity:** Medium
- **Category:** Testing / Release Operations
- **Disposition:** Open — Required Before Release
- **Release impact:** The current packaging defect demonstrates that unit tests alone are insufficient to catch release-blocking runtime issues.
- **Affected roles:** All users.
- **Affected files/locations:** `.github/workflows/ci.yml`, `.github/workflows/release.yml`
- **Evidence:** CI runs `npm test` but does not install the `.vsix` in VS Code or verify package contents.
- **Root cause:** The project lacks E2E / packaging validation gates.
- **Impact:** High-impact bugs (missing dependencies) can pass CI and be released.
- **Likelihood:** High if not addressed.
- **Recommended solution:**
  1. Add a CI step after `vsce package` that extracts the `.vsix` and fails if `node_modules/<runtime-dep>` is missing (or confirms a bundled `extension.js`).
  2. Add a lightweight VS Code Extension Host test using `@vscode/test-cli` that opens the command palette and runs `AI Agent Hub: Open`.
  3. If full E2E is too heavy, at least run `node -e "require('./out/extension.js')"` with a minimal `vscode` stub to catch missing modules.
- **Regression risks:** E2E tests can be flaky; keep them focused on activation and one sync flow.
- **Tests to add:** packaging validation and one extension-host smoke test.
- **Verification steps:**
  1. Push the updated CI and confirm it catches the current missing-dependency issue.
  2. After fixing packaging, confirm CI is green.

### AUDIT-007 — Remote builtin content update overwrites installed extension files

- **Classification:** Probable Risk
- **Severity:** Medium
- **Category:** Security / Data Integrity
- **Disposition:** Needs Product Decision
- **Release impact:** The extension modifies its own install directory, which may fail on read-only installs or be reverted on update; remote content could in theory be tampered if HTTPS/GitHub credentials are compromised.
- **Affected roles:** All users.
- **Affected files/locations:**
  - `src/core/syncEngine.ts:82-88`
  - `src/core/hubUpdater.ts:91-136`
- **Evidence:** `HubUpdater.copyHubContent` writes to `extensionPath/hub-content/...`.
- **Root cause:** Builtin content updates are written to the extension install directory rather than user-writable global storage.
- **Impact:**
  - In some environments the extension directory is read-only; writes will silently fail and sync falls back to old content.
  - A compromised remote branch could overwrite prompt content that agents will consume.
  - Extension updates will overwrite locally updated builtins.
- **Likelihood:** Low for exploit (requires GitHub branch compromise), medium for reliability issues.
- **Recommended solution:**
  1. Store updated builtins in `context.globalStorageUri`/`<globalStorage>/hub-content` and load from there first, falling back to the bundled `extensionPath/hub-content`.
  2. Verify the remote clone uses the `main` branch of the same repo and consider pinning to a known-good commit/tag.
- **Regression risks:** Changes to content lookup order; ensure tests cover both bundled and updated content.
- **Tests to add:** Test that `HubUpdater` writes to global storage, not extension path.
- **Verification steps:**
  1. Trigger a sync with network.
  2. Verify updated files land in a user-writable cache directory, not `<install>/hub-content/`.

### AUDIT-008 — Frontmatter parser is not YAML-compliant

- **Classification:** Design Concern
- **Severity:** Low
- **Category:** Data Integrity / Maintainability
- **Disposition:** Scheduled Post-Release
- **Release impact:** Builtin files with quoted colons, multi-line values, or YAML lists will not parse correctly.
- **Affected roles:** Content authors and maintainers of `hub-content/`.
- **Affected files/locations:** `src/core/registry.ts:209-227`
- **Evidence:** Parser splits each frontmatter line at the first `:` without YAML escaping or quote handling.
- **Root cause:** Custom key-value parser instead of a YAML library.
- **Impact:** Metadata in bundled files may be parsed incorrectly, leading to wrong `name`, `enabled`, or `trigger` values.
- **Likelihood:** Low currently (demo files use simple key-value), but grows with content complexity.
- **Recommended solution:** Either add a YAML parser (e.g., `js-yaml`) for frontmatter or update the README to describe the format as "simple `key: value` frontmatter" rather than YAML.
- **Regression risks:** YAML parser may introduce a new runtime dependency; consider bundling or replacing with a tiny parser.
- **Tests to add:** Add tests for quoted colons and multi-line values.
- **Verification steps:** Create a builtin skill with `description: "A: B"` and verify it is parsed correctly.

### AUDIT-009 — README lists unregistered MCP commands

- **Classification:** Design Concern
- **Severity:** Low
- **Category:** Documentation / Consistency
- **Disposition:** Scheduled Post-Release
- **Release impact:** Users may look for commands that do not exist.
- **Affected roles:** Users.
- **Affected files/locations:** `README.md` (commands table), `package.json` (`contributes.commands`)
- **Evidence:** README lists `AI Agent Hub: Add MCP Server` and `AI Agent Hub: Show MCP Servers`; `package.json` registers only seven commands and neither is MCP-related.
- **Recommended solution:** Either register the two MCP commands in `package.json` and `src/extension.ts` or remove them from the README.
- **Regression risks:** Minimal.

### AUDIT-010 — MCP port conflict check is config-only

- **Classification:** Probable Risk
- **Severity:** Low
- **Category:** Reliability
- **Disposition:** Scheduled Post-Release
- **Release impact:** `McpManager` may fail to start if the port is already in use by another process.
- **Affected files/locations:** `src/core/mcpStore.ts:50-53`
- **Evidence:** Port uniqueness is checked only against other stored MCP configs, not the OS.
- **Recommended solution:** Add a bind check before spawning, or handle `EADDRINUSE` with a clearer error message.
- **Regression risks:** Minor.

---

## Remediation Plan

### Immediate release blockers

1. **AUDIT-001 — Fix `.vsix` packaging.** Decide between shipping `node_modules` or bundling. Implement, update `package.json` and `release.yml`, and add a packaging-validation CI step.
2. **AUDIT-002 — Package and pin MCP runtime.** If MCP is in scope, add `mcp-proxy` to `dependencies` with an exact version and invoke the resolved binary. If not in scope, remove MCP UI/commands.
3. **AUDIT-003 — Patch `fast-uri` / update `ajv`.** Ensure runtime dependency audit is clean.

### Required pre-release work

4. **AUDIT-004 — Update vulnerable dev/build dependencies.** Prioritize `@vscode/vsce` and `vitest`.
5. **AUDIT-005 — Prevent duplicate item-name data loss.** Enforce unique names per type or disambiguate file names.
6. **AUDIT-006 — Add packaging / extension-host validation.** Catch missing dependencies and activation failures in CI.
7. **AUDIT-007 — Decide on remote builtin-update location.** Consider moving updates to user-writable global storage.

### Short-term post-release improvements

8. **AUDIT-008 — Replace frontmatter parser or update README.**
9. **AUDIT-009 — Align README command list with `package.json`.**
10. **AUDIT-010 — Improve MCP port conflict handling.**

### Long-term architectural improvements

- Add a bundler (webpack/esbuild) to reduce `.vsix` size and avoid shipping `node_modules`.
- Add import/export and backup features for user content.
- Consider marketplace-specific packaging and publishing checks.
- Evaluate telemetry, crash reporting, and opt-in analytics if user base grows.

---

## Residual Risks and Final Checklist

### Accepted and deferred risks

| Risk | Rationale | Disposition |
|------|-----------|-------------|
| No telemetry / crash reporting | Local single-user MVP; can be added post-release | Accepted Risk |
| No RBAC / multi-tenancy | Out of scope for a local dev tool | Accepted Risk |
| No formal accessibility certification | VS Code webviews inherit platform a11y; manual keyboard testing recommended | Accepted Risk |
| MCP executes arbitrary npm packages | User explicitly registers packages; mitigated by validation and `shell: false` | Accepted Risk (with documentation) |

### Unverified concerns

- Real VS Code extension-host activation and command execution.
- Actual file sync into Cursor/Kiro/Copilot/Amazon Q config folders.
- MCP server end-to-end startup against a real package.
- Marketplace acceptance, icon, and metadata validation.
- Windows path handling and `npx.cmd` behavior.

### Required manual / specialized testing before release

1. Install the built `.vsix` in a clean VS Code profile and activate the extension.
2. Open the Hub panel, add a skill, and sync to a test workspace.
3. Verify files appear in the configured agent target folder with the correct layout/extension.
4. If MCP ships, register and start `@modelcontextprotocol/server-filesystem` and verify the HTTP endpoint.
5. Run `npm audit` on the final lockfile and confirm no moderate+ runtime vulnerabilities.

### Readiness checklist

| Area | Status | Evidence |
|------|--------|----------|
| Build | Pass | `npm run build` exits 0 |
| Type checking | Pass | `tsc` with `strict: true` |
| Lint | Pass | `npm run lint` exits 0 |
| Format | Pass | `npm run format:check` exits 0 |
| Unit tests | Pass | `npm test` — 38 tests pass |
| Packaging | Fail | `.vsix` missing `node_modules` / runtime dependencies |
| Security (access control) | Not Applicable | Local single-user extension |
| Security (input validation) | Partial | Path validation, arg validation present; dependency CVEs remain |
| Security (supply chain) | Fail | `mcp-proxy` fetched by `npx`; `fast-uri` and other CVEs present |
| Deployment / CI | Partial | Workflows exist; packaging validation missing |
| Monitoring / observability | Not Applicable | Local dev tool, no runtime service |
| Backup / disaster recovery | Not Applicable | User content in Memento; manual backup not implemented |
| Performance / scalability | Not Tested | In-memory registry and file writes; expected fine for small data |
| UX / accessibility | Not Tested | Webview UI not exercised in a real VS Code host |
| E2E / smoke tests | Fail | No extension-host or packaging smoke test |

---

*End of audit.*
