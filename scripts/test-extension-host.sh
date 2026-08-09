#!/usr/bin/env bash
# Extension Host smoke test for ai-agent-hub.
# Downloads a clean VS Code: build, installs the packaged .vsix into a throwaway
# profile, opens an empty workspace, and asserts the extension activates without
# "Cannot find module" errors.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

VERSION="$(node -p "require('$REPO_ROOT/package.json').version")"
VSIX="$REPO_ROOT/ai-agent-hub-$VERSION.vsix"
VSCODE_DIR="${VSCODE_DIR:-/tmp/vscode-host}"
TEST_DIR="${TEST_DIR:-/tmp/vscode-host-test}"

if [[ ! -f "$VSIX" ]]; then
  echo "Building .vsix..."
  (cd "$REPO_ROOT" && npm run package)
fi

if [[ ! -x "$VSCODE_DIR/bin/code" ]]; then
  echo "Downloading VS Code: stable..."
  rm -rf "$VSCODE_DIR"
  mkdir -p "$VSCODE_DIR"
  curl -L -o /tmp/vscode-host.tar.gz "https://update.code.visualstudio.com/latest/linux-x64/stable"
  tar -xzf /tmp/vscode-host.tar.gz -C "$VSCODE_DIR" --strip-components=1
fi

rm -rf "$TEST_DIR"
mkdir -p "$TEST_DIR/exts" "$TEST_DIR/data/User" "$TEST_DIR/workspace"

cat > "$TEST_DIR/data/User/settings.json" <<'EOF'
{
  "security.workspace.trust.enabled": false,
  "telemetry.telemetryLevel": "off",
  "window.restoreWindows": [],
  "workbench.startupEditor": "none"
}
EOF

echo "Installing extension..."
"$VSCODE_DIR/bin/code" \
  --extensions-dir "$TEST_DIR/exts" \
  --user-data-dir "$TEST_DIR/data" \
  --install-extension "$VSIX"

echo "Launching Extension Host..."
DISPLAY="${DISPLAY:-:0}" "$VSCODE_DIR/bin/code" \
  "$TEST_DIR/workspace" \
  --extensions-dir "$TEST_DIR/exts" \
  --user-data-dir "$TEST_DIR/data" \
  --no-sandbox --disable-gpu --new-window \
  >"$TEST_DIR/vscode.log" 2>&1 &

CODE_PID=$!
trap 'kill $CODE_PID 2>/dev/null || true' EXIT

# Wait for logs to appear.
for i in {1..30}; do
  sleep 1
  LOG_DIR=$(find "$TEST_DIR/data/logs" -name '1-AI Agent Hub.log' 2>/dev/null | head -n1 || true)
  if [[ -n "$LOG_DIR" ]]; then
    break
  fi
done

if [[ -z "${LOG_DIR:-}" ]]; then
  echo "ERROR: Extension did not produce an output log within 30 seconds." >&2
  exit 1
fi

for i in {1..20}; do
  sleep 1
  if grep -q 'AI Agent Hub activated successfully' "$LOG_DIR"; then
    echo "PASS: Extension Host activation succeeded."
    exit 0
  fi
  if grep -qE 'Cannot find module|Activating extension.*failed' "$LOG_DIR" "$TEST_DIR/vscode.log" 2>/dev/null; then
    echo "ERROR: Extension activation failed." >&2
    exit 1
  fi
done

echo "ERROR: Timed out waiting for activation log." >&2
exit 1
