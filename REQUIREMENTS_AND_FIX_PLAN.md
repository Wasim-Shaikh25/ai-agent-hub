# AI Agent Hub — Fix Plan

Based on the due-diligence review and the product-owner feedback, this document lists the genuine blockers that must be fixed before the extension is safe to publish as an open-source VS Code extension.

The plan is calibrated to the nature of the product: an open-source developer tool does **not** need enterprise-grade telemetry, SaaS monetization, or DDD/microservices. It **does** need to activate, not corrupt user files, not execute arbitrary shell commands, and have passing CI.

---

## 1. Activation (P0 — launch blocker)

**Problem:** `package.json` declares `"activationEvents": []`. The extension may not activate when commands are invoked.

**Fix:** Add explicit `onCommand` activation events for every contributed command, plus `onStartupFinished` so auto-start MCP servers actually run.

**Acceptance:**
- [ ] After install, running any `AI Agent Hub:` command activates the extension.
- [ ] MCP servers marked `autoStart` start when VS Code starts.

---

## 2. Security — MCP command injection (P0)

**Problem:** `McpManager` spawns `npx` with `shell: true` using unsanitized `packageName` and `args`. A value containing shell metacharacters can execute arbitrary code.

**Fix:**
- [ ] Remove `shell: true` from the outer `spawn` (use `npx` / `npx.cmd` directly per platform).
- [ ] Validate `packageName` against an npm package-name regex.
- [ ] Validate each arg against a safe whitelist (no `;`, `|`, `&`, `$`, `` ` ``, `<`, `>`, `\`, etc.).
- [ ] Improve `parseEnvString` so env values with spaces/quotes are handled correctly, and validate keys.

**Acceptance:**
- [ ] Passing `packageName: "foo; rm -rf /"` is rejected before spawning.
- [ ] Passing an arg with shell metacharacters is rejected.
- [ ] Windows and POSIX both spawn successfully.

---

## 3. Security — path traversal / unsafe sync writes (P0)

**Problem:** `FileWriter` writes to `target.path` without resolving it against a base directory, and `PathUtils` does not reject `../` or paths that escape the intended base.

**Fix:**
- [ ] Add `PathUtils.resolveSafeTarget(basePath, targetPath)` that resolves, normalizes, and verifies the final absolute path is inside `basePath` and not `.git`/`node_modules`/system dirs.
- [ ] `FileWriter.write` requires a `basePath` argument.
- [ ] Agent-config sync uses the first workspace folder as `basePath`.
- [ ] Repo-level sync uses `repo.repoPath` as `basePath`.
- [ ] `PathUtils.isUnsafePath` also rejects any `..` segment.

**Acceptance:**
- [ ] A target path of `../etc/passwd` is rejected.
- [ ] A target path of `.cursor/rules` resolves to `<workspace>/.cursor/rules`.
- [ ] MCP rule writes use the same safe resolution.

---

## 4. CI / Testing (P0)

**Problem:** `npm test` fails because there are no test files.

**Fix:**
- [ ] Add `vitest` config.
- [ ] Add unit tests for security-sensitive and core paths: `PathUtils`, `FileWriter`, `AgentDetector`, `Registry`, `SyncEngine`.
- [ ] Mock the `vscode` module where required.
- [ ] Ensure `npm test` passes locally and in CI.

**Acceptance:**
- [ ] `npm test` exits 0.
- [ ] CI build-and-test job passes.

---

## 5. Validator drift / dead code (P1)

**Problem:** `Validator` is instantiated in `extension.ts` as `_validator` but never used. Schemas are out of sync with runtime types (e.g. `format`/`mergeStrategy` vs `fileExtension`/`fileLayout`, missing `workflow`/`persona` schemas, `tool` target). README advertises schema validation.

**Fix:**
- [ ] Update `agent-target.schema.json` to match `AgentTargetConfig` / `TargetLocationConfig`.
- [ ] Add `workflow.schema.json` and `persona.schema.json` aligned with runtime types.
- [ ] Wire `Validator` into `Registry.addItem`, `Registry.updateItem`, and `Registry.parseBuiltinFile` (skip invalid builtins with a warning).
- [ ] Wire `Validator` into `SetupPanel.onSave` for agent configs.
- [ ] Remove or update the unused `tool` schema entry if it has no runtime counterpart.

**Acceptance:**
- [ ] Invalid hub items are rejected or skipped with a clear message.
- [ ] Invalid agent configs are rejected before saving.

---

## 6. Packaging hygiene (P1)

**Problem:** `vsce package` warns that `LICENSE` is missing and that no `.vscodeignore` / `files` property exists, so source files, CI files, and `package-lock.json` are bundled into the `.vsix`.

**Fix:**
- [ ] Add `LICENSE` (MIT).
- [ ] Add `.vscodeignore` that excludes `src/`, `.github/`, `.vscode/` (except launch config if needed), `node_modules/`, `out/**/*.map` (optional), test files, `*.vsix`, and `REQUIREMENTS_AND_FIX_PLAN.md` / `DUE_DILIGENCE_REVIEW.md`.

**Acceptance:**
- [ ] `npx vsce package --no-dependencies` completes with no warnings.
- [ ] The produced `.vsix` contains only `out/`, `hub-content/`, `schemas/`, `package.json`, and `README.md`/`LICENSE`.

---

## 7. README / naming consistency (P1)

**Problem:** README describes a content type called "agent" and a folder `agents/`, but the code uses `persona` and `personas/`.

**Fix:**
- [ ] Align README and code on `persona` / `personas/` (or rename code to `agent` if preferred).
- [ ] Update any stale file-extension examples.

**Acceptance:**
- [ ] Running `AI Agent Hub: Open` shows the same terminology as the README.

---

## 8. Code quality follow-up (P2)

**Problem:** `SyncEngine` is accumulating responsibilities; no lint/format config exists.

**Fix (low priority):**
- [ ] Add `eslint` + `prettier` config and run in CI (optional).
- [ ] Consider extracting MCP rule generation and repo-sync loops into helpers if `SyncEngine` continues to grow.

**Acceptance:**
- [ ] Optional; not a launch blocker.

---

## Out of scope

The following are intentionally **not** in this plan because they are not prerequisites for an open-source VS Code extension launch:

- Enterprise SSO / RBAC / audit logs
- Telemetry / analytics
- Marketplace monetization
- Multi-tenancy
- Cloud sync / backend
- DDD / microservices / CQRS

---

## Launch gating decision

Publish only after P0 and P1 items are merged and `npm test`, `npm run build`, and `npx vsce package --no-dependencies` all pass cleanly.
