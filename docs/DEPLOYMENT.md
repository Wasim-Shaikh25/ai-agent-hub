# Deployment Guide

Ship AI Agent Hub as a hosted SaaS or self-hosted in a customer's VPC — the
same images either way.

## 1. Requirements

- Docker + Compose (or Kubernetes), or Node 20 + Postgres 16 (pgvector).
- Postgres with the `vector` and `pgcrypto` extensions (the `pgvector/pgvector`
  image ships them).
- Optional: provider keys (OpenAI/Anthropic) for real inference/embeddings;
  WorkOS for SSO; Stripe for billing.

## 2. Quick production start (Docker)

```bash
cd deploy
cp .env.example .env        # then edit — set the secrets below
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Set at minimum:

| Var | Why |
|---|---|
| `POSTGRES_PASSWORD` | database password |
| `JWT_SECRET` | signs session tokens — use a long random value |
| `LITELLM_MASTER_KEY` | gateway ↔ LiteLLM auth |
| `APP_BASE_URL` | public URL (SSO redirects, checkout URLs) |
| `CORS_ORIGIN` | your dashboard origin(s), comma-separated |

Optional: `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`, `WORKOS_*`, `STRIPE_*`,
`EMBEDDINGS_PROVIDER=minilm`.

## 3. Health & readiness

- `GET /health` — liveness (no DB).
- `GET /ready` — readiness (checks Postgres; 503 when down). Point your load
  balancer / k8s readiness probe here.

## 4. Operations

- **Migrations** run automatically on boot; also `npm run migrate`.
- **Backups**: back up Postgres (all state — context, memory, usage, billing).
- **Retention**: set a per-org `retention` policy (`{days}`); the scheduler
  sweeps daily.
- **Rate limits**: `RATE_LIMIT_PER_MIN` (default 600/key/min).
- **Platform console** — `/superadmin` gives you (the operator) cross-org
  control: change any workspace's plan, suspend/resume it, browse captured
  training data, and chat with the **operator copilot** (grounded in live
  platform stats). Access is restricted to users flagged
  `app_user.is_platform_admin = true`; a suspended org is blocked at auth (403).
- **Training capture**: `TRAINING_LOG=true` records redacted gateway
  request/response pairs; `POST /api/feedback` and the copilot also feed the
  `training_sample` table. Export via `GET /api/platform/training?limit=…`.
- **Scaling**: the server is stateless — run N replicas behind a load balancer;
  Postgres + Redis are the shared state. LiteLLM scales independently.
- **Graceful shutdown**: SIGTERM drains in-flight requests and closes the pool.

## 4b. Test it locally before you ship (walkthrough)

This is the fastest way for **you (the operator)** to confirm a build works.

```bash
cd deploy && cp .env.example .env
docker compose up --build          # Postgres+pgvector, Redis, LiteLLM, hub-server
```

Then, in a browser and a terminal:

1. **Web app** — open `http://localhost:8080/login`, click **Sign up**, create an
   account. You land on `/account` with your plan (Free), usage, and an API key.
2. **Dashboard** — open `http://localhost:8080/dashboard`, paste the key → live
   cost/usage/audit.
3. **Health** — `curl localhost:8080/health` and `curl localhost:8080/ready`.
4. **Connect an agent** —
   ```bash
   npm i -g @ai-agent-hub/cli   # or: node cli/index.mjs <cmd>
   aihub login --url http://localhost:8080 --key <your-key>
   aihub connect cursor && aihub index
   ```
5. **Smoke test the API** — the calls in `docs/specs/04-local-dev.md §4`.

Everything above runs offline (local embeddings, dev SSO). Add provider/Stripe/
WorkOS keys only when you want real inference / billing / enterprise SSO.

## 4c. Customer vs operator (important)

You run **one** deployment; customers **use** it — they never run the server.
Their flow is: sign up at your URL → get an API key → `aihub connect` their
agents. Your flow is this document.

## 5. Data residency

- `STORAGE_MODE=central` keeps all context on your Postgres. Self-host in the
  customer VPC → data never leaves their network.
- `LOG_PROMPTS=false` (default) means prompt bodies are never stored.
- PII/secret redaction (`REDACTION_ENABLED=true`) strips secrets before storage
  and before any provider call.

## 6. Kubernetes (sketch)

Build/push `server/Dockerfile`, run it as a Deployment with `/ready` as the
readiness probe, a Secret for the env above, and managed Postgres (pgvector) +
Redis. Run LiteLLM as its own Deployment. Horizontal-scale the server freely.
