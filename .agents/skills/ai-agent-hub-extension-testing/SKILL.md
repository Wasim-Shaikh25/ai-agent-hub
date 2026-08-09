---
name: ai-agent-hub-extension-testing
description: End-to-end testing of the ai-agent-hub VS Code: extension, including packaging, .vsix inspection, stub activation, and Extension Host smoke tests.
---

## When to use

When you need to verify that the packaged `ai-agent-hub` `.vsix` can activate in a real VS Code: Extension Host, or when auditing packaging/runtime-dependency issues for this repo.

## One-time environment setup

- The repo root is at `/home/ubuntu/repos/ai-agent-hub`.
- Node 20 and npm are assumed installed.
- Run `npm install` (or `npm ci`) before testing.
- A real VS Code: build is not pre-installed. Download and extract the official stable Linux tarball to `/tmp/vscode`:
  ```bash
  curl -L -o /tmp/vscode.tar.gz "https://update.code.visualstudio.com/latest/linux-x64/stable"
  mkdir -p /tmp/vscode
  tar -xzf /tmp/vscode.tar.gz -C /tmp/vscode --strip-components=1
  ```
- The `/opt/.devin/binaries/code` binary is the Devin CLI, not a VS Code: Extension Host; do not use it to install/activate `.vsix` files.

## Launching a clean Extension Host

Use a dedicated `--extensions-dir` and `--user-data-dir` so you do not pollute the system profile:

```bash
rm -rf /tmp/vscode-test
mkdir -p /tmp/vscode-test/exts /tmp/vscode-test/data /tmp/vscode-test/workspace
/tmp/vscode/bin/code /tmp/vscode-test/workspace \
  --extensions-dir /tmp/vscode-test/exts \
  --user-data-dir /tmp/vscode-test/data \
  --no-sandbox --disable-gpu
```

In container/remote-desktop environments `--no-sandbox` and `--disable-gpu` are often required for Electron to start.

## Trusting the workspace

If the workspace opens in Restricted Mode, the extension may not activate at all. Trust the folder via the command palette (`Workspaces: Manage Workspace Trust`) before expecting activation.

## Verifying the packaged `.vsix`

1. Build/package: `npm run package` produces `ai-agent-hub-<version>.vsix`.
2. Inspect contents: `unzip -l ai-agent-hub-0.0.7.vsix | grep extension/node_modules/` should show `node_modules` entries if dependencies are shipped.
3. Confirm compiled code still imports the runtime dependency:
   `unzip -p ai-agent-hub-0.0.7.vsix extension/out/core/validator.js | grep -E "require\(['\"]ajv['\"]\)"`
4. To reproduce activation without launching VS Code:, extract the `.vsix` and add a stub `node_modules/vscode.js`, then run:
   `node -e "require('./out/extension.js')"`

## Where to look for activation errors

- Open Output panel (`View: Toggle Output`), select the `Extension Host` channel.
- Missing runtime dependencies produce `Error: Cannot find module '<pkg>'` with a require stack.

## Base checks

Run these before packaging:

```bash
npm run lint
npm run build
npm run format:check
npm test
```

## Common pitfalls

- `vsce package --no-dependencies` intentionally omits `node_modules`; if the extension code still `require`s a package like `ajv` and the package is not bundled, activation fails in the Extension Host.
- Activation errors can be hidden behind the Restricted Mode trust dialog.
- The Devin CLI `code` can `serve-web` or `tunnel`, but it cannot install/run a local `.vsix` like a desktop Extension Host.

## Devin Secrets Needed

None.
