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
- **Scaling**: the server is stateless — run N replicas behind a load balancer;
  Postgres + Redis are the shared state. LiteLLM scales independently.
- **Graceful shutdown**: SIGTERM drains in-flight requests and closes the pool.

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
