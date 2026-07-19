# Local Development Spec — run the full stack on your machine

> Status: **draft v1** · Goal: `docker compose up` gives you the whole product
> locally with **no external API keys required** for a first demo.

## 1. Prerequisites

- Docker + Docker Compose v2
- Node 20+ and npm 9+ (only if you want to run the server outside Docker)

## 2. One-command start

```bash
cd deploy
cp .env.example .env        # tweak if you want; defaults work offline
docker compose up --build
```

This starts four containers:

| Service | Port | What |
|---|---|---|
| `postgres` | 5432 | Postgres 16 + pgvector (data + embeddings) |
| `redis` | 6379 | cache / rate limits |
| `litellm` | 4000 | LLM gateway (OpenAI-compatible) |
| `hub-server` | 8080 | the Hub (REST + MCP) |

On first boot the server runs migrations and prints a **`DEV_API_KEY`** to the
logs. Copy it.

## 3. Offline mode (no provider keys)

`EMBEDDINGS_PROVIDER=local` (the default in `.env.example`) uses a deterministic
local embedding so **memory + RAG work with zero API keys**. Switch to
`EMBEDDINGS_PROVIDER=litellm` and add a provider key in
`deploy/litellm.config.yaml` when you want real embeddings/inference.

## 4. Smoke test

```bash
# health
curl -s localhost:8080/health

# who am I (use the DEV_API_KEY from logs)
curl -s localhost:8080/api/me -H "Authorization: Bearer $DEV_API_KEY"

# write + search memory (proves the Context Plane works end-to-end)
curl -s localhost:8080/api/memory -H "Authorization: Bearer $DEV_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"kind":"decision","content":"We use Fastify for the Hub server."}'

curl -s "localhost:8080/api/memory?q=which%20web%20framework" \
  -H "Authorization: Bearer $DEV_API_KEY"
```

## 5. Connect an agent (MCP)

Get the config snippet for your agent:

```bash
curl -s "localhost:8080/api/mcp-config?agent=cursor" \
  -H "Authorization: Bearer $DEV_API_KEY"
```

Paste it into the agent's MCP config (`.cursor/mcp.json`, Claude Code
`.mcp.json`, etc.). The agent then has `session_get_context`, `memory_search`,
`rag_query`, `skills_list`, … as native tools.

## 5b. Try the gateway (fallback + routing + metering)

The gateway proxies OpenAI-compatible calls to LiteLLM with policy-based model
routing, automatic fallback, usage metering, and budgets. Point any agent's base
URL at `http://localhost:8080/v1` (auth with your `DEV_API_KEY`).

```bash
# configure a fallback chain: primary -> backup
curl -s localhost:8080/api/policies -H "Authorization: Bearer $DEV_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"kind":"model","spec":{"model":"gpt-4o-mini","fallbacks":["claude-sonnet"]}}'

# a chat completion (needs a provider key in deploy/.env for a real answer)
curl -s localhost:8080/v1/chat/completions -H "Authorization: Bearer $DEV_API_KEY" \
  -H 'Content-Type: application/json' -D - \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hi"}]}'
# response headers include x-hub-model (who served it) and x-hub-tried (the chain)

# see metered usage
curl -s localhost:8080/api/usage -H "Authorization: Bearer $DEV_API_KEY"
```

Task-based routing: send `-H 'x-hub-task: refactor'` and add a routing policy
(`{"kind":"routing","spec":{"task":"refactor","model":"claude-sonnet"}}`) to send
that task class to a specific model.

## 6. Run the server outside Docker (fast iteration)

```bash
cd server
npm install
cp .env.example .env       # point DB/REDIS at the compose containers
npm run migrate
npm run dev                # tsx watch on :8080
```

Keep `postgres`, `redis`, `litellm` running via
`docker compose up postgres redis litellm`.

## 7. Environment variables

| Var | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | hub-server port |
| `DATABASE_URL` | `postgres://hub:hub@postgres:5432/hub` | Postgres DSN |
| `REDIS_URL` | `redis://redis:6379` | Redis DSN |
| `LITELLM_URL` | `http://litellm:4000` | gateway base URL |
| `EMBEDDINGS_PROVIDER` | `local` | `local` (offline) or `litellm` |
| `EMBEDDING_DIM` | `1536` | vector dimension |
| `DEV_SEED` | `true` | seed a dev org + API key on first boot |

## 8. Teardown

```bash
docker compose down            # stop
docker compose down -v         # stop + wipe data
```
