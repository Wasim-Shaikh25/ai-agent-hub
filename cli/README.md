# aihub CLI

Connect any AI coding agent — including non-VS-Code ones (Claude Code, Codex,
Cline, CI runners) — to an AI Agent Hub server with one command. No
dependencies; Node 20+ only.

## Install

```bash
npm install -g @ai-agent-hub/cli    # or: node cli/index.mjs <cmd>
```

## Usage

```bash
# save + validate credentials (~/.ai-agent-hub/config.json)
aihub login --url http://localhost:8080 --key <API_KEY>

aihub status                       # server + auth status

# write the native MCP config into an agent + print gateway settings
aihub connect cursor --dir .       # -> .cursor/mcp.json
aihub connect claude --dir .       # -> .mcp.json (Claude Code) + ANTHROPIC_BASE_URL
aihub connect vscode --dir .       # -> .vscode/mcp.json
aihub connect windsurf             # -> ~/.codeium/windsurf/mcp_config.json

aihub config cursor                # just print the snippet

# index the whole repo for RAG + knowledge map (code-aware, by symbol)
aihub index --dir .                # walks the repo, uploads to project=<repo>
```

`connect` merges into any existing MCP config without clobbering other servers,
then prints how to point that agent's inference at the Hub gateway (OpenAI base
URL for most tools, `ANTHROPIC_BASE_URL` for Claude Code).

## What the agent gets

- **Context tools over MCP:** `session_get_context`, `memory_search/write`,
  `rag_query`, `skills_list`, plus every aggregated downstream MCP tool.
- **Gateway (optional):** fallback chains, task→model routing, and usage/cost
  metering when you route inference through the Hub.
