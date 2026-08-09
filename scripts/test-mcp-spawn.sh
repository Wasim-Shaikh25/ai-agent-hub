#!/usr/bin/env bash
# Smoke test that the bundled mcp-proxy binary can start with a minimal MCP
# server over stdio and listen on a TCP port.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PORT="${1:-9666}"
TIMEOUT_SEC="${2:-10}"

MCP_PROXY_BIN="$REPO_ROOT/node_modules/mcp-proxy/dist/bin/mcp-proxy.mjs"
FAKE_SERVER="$REPO_ROOT/scripts/fake-mcp-server.mjs"

if [[ ! -f "$MCP_PROXY_BIN" ]]; then
  echo "ERROR: mcp-proxy binary not found at $MCP_PROXY_BIN" >&2
  exit 1
fi

LOG="$(mktemp)"
trap 'rm -f "$LOG"; pkill -f "mcp-proxy.*--port $PORT" 2>/dev/null || true' EXIT

node "$MCP_PROXY_BIN" --port "$PORT" -- node "$FAKE_SERVER" >"$LOG" 2>&1 &
MCP_PID=$!

# Wait for the server to log the port or exit.
for i in $(seq 1 "$TIMEOUT_SEC"); do
  if grep -q "starting server on port $PORT" "$LOG"; then
    break
  fi
  if ! kill -0 "$MCP_PID" 2>/dev/null; then
    echo "ERROR: mcp-proxy exited before starting:" >&2
    cat "$LOG" >&2
    exit 1
  fi
  sleep 1
done

if ! grep -q "starting server on port $PORT" "$LOG"; then
  echo "ERROR: mcp-proxy did not start within $TIMEOUT_SEC seconds:" >&2
  cat "$LOG" >&2
  exit 1
fi

# Verify the port is actually listening.
if ! bash -c "exec 3<>/dev/tcp/localhost/$PORT" 2>/dev/null; then
  echo "ERROR: mcp-proxy is not listening on port $PORT" >&2
  exit 1
fi

echo "PASS: mcp-proxy started and is listening on port $PORT."
