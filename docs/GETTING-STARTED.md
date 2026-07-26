# Getting Started

Connect your AI coding agents to a shared brain in ~5 minutes.

## 1. Run the Hub

```bash
cd deploy
cp .env.example .env
docker compose up --build
```

It prints a `DEV_API_KEY` on first boot. Copy it. The operator account is seeded
from `SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD` in `.env` (default
`admin@localhost` / `change-me`). The Hub is at `http://localhost:8080`
(dashboard at `/dashboard`, operator console at `/superadmin-login`).

## 2. Connect an agent

Install the CLI and point your agent at the Hub:

```bash
npm i -g @ai-agent-hub/cli      # or: node cli/index.mjs <cmd>
aihub login --url http://localhost:8080 --key <DEV_API_KEY>

aihub connect cursor            # writes .cursor/mcp.json
aihub connect claude            # writes .mcp.json + ANTHROPIC_BASE_URL hint
```

`connect` auto-detects your repo (project) and branch (session) and binds them,
so context is scoped correctly with no manual setup.

## 3. Index your codebase

```bash
aihub index                     # walks the repo, code-aware, into project=<repo>
```

Now your agent has, over MCP:
- `knowledge_map` — see which files/specs hold what.
- `rag_query` — hybrid (BM25 + semantic) code-aware retrieval, cited `path:symbol`.
- `session_get_context` — token-budgeted context: rules + memory + evidence.
- `memory_search` / `memory_write` — durable shared memory across agents.

## 4. (Optional) Route inference through the Hub

Point the agent's base URL at the Hub for fallback, routing, and cost metering:
- OpenAI-format tools: base URL `http://localhost:8080/v1`, key = your Hub key.
- Claude Code: `ANTHROPIC_BASE_URL=http://localhost:8080`.

## 5. See the value

- Open `http://localhost:8080/dashboard` with a user key for cost, tokens,
  cache-hit rate, latency, per-developer spend, and audit trail.
- Open `http://localhost:8080/activity` for a user's own usage, connected agents,
  and recent actions.
- Open `http://localhost:8080/admin` as an org `admin`/`owner` to manage the
  workspace, team, and agents.
- Open `http://localhost:8080/superadmin-login` as the operator to provision
  orgs, change plans, and triage tickets.

## What you get for free vs paid

Free covers a single developer's core workflow (context, hybrid RAG, knowledge
map, MCP, gateway fallback). Team/Enterprise add shared cross-agent context,
cost analytics, semantic cache, quality routing, SSO, and self-host. See
[PRICING.md](PRICING.md).
