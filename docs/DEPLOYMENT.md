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
| `SUPERADMIN_PASSWORD` | operator account for `/superadmin-login` — change from default |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | sends superadmin OTP codes (optional; falls back to stdout) |
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
  control: change any workspace's plan, suspend/resume it, analyze the **issue
  log**, and chat with the **operator copilot** (grounded in live platform
  stats + recent issues). Access is restricted to users flagged
  `app_user.is_platform_admin = true`; a suspended org is blocked at auth (403).
- **Issue analysis**: the gateway and auth layers log operational events
  (provider errors, budget/limit hits, redaction blocks, suspended-org denials,
  and slow calls past `SLOW_REQUEST_MS`) to `system_event`. The Issues tab
  aggregates them (errors/warnings over 24h, top codes, worst-affected orgs) so
  you can spot and diagnose problems; the copilot reads the same summary.
  Messages are redacted at rest. Endpoints: `GET /api/platform/events` and
  `GET /api/platform/events/summary`.
- **Feedback labels**: `POST /api/feedback` records 👍/👎 on completions into
  `training_sample` — useful signal, and thumbs-down is worth wiring to alerts.
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

1. **Operator console** — open `http://localhost:8080/superadmin-login`, sign in
   with `SUPERADMIN_EMAIL` and `SUPERADMIN_PASSWORD` (OTP is sent by email or
   printed to stdout if SMTP is not configured). You can then create workspaces
   under **Organizations**.
2. **SSO / domain auto-join** — register an org with `adminEmail=admin@example.com`,
   then sign in as that user via `/auth/sso/login` or `/auth/oauth/google`. The
   first matching email becomes `owner`; other `@example.com` users auto-join
   as `member`.
3. **Web app** — open `http://localhost:8080/login`, click **Sign up**, create an
   account. You land on `/account` with your plan (Free), usage, and an API key.
4. **Dashboard / activity** — open `http://localhost:8080/dashboard` for org-level
   cost/usage/audit, or `http://localhost:8080/activity` for the signed-in user's
   own usage, agents, and recent actions.
5. **Admin console** — as an org `owner`/`admin`, open `/admin` to manage team,
   agents, content, and API keys, and to promote members to admins.
6. **Health** — `curl localhost:8080/health` and `curl localhost:8080/ready`.
7. **Connect an agent** —
   ```bash
   npm i -g @ai-agent-hub/cli   # or: node cli/index.mjs <cmd>
   aihub login --url http://localhost:8080 --key <your-key>
   aihub connect cursor && aihub index
   ```
8. **Smoke test the API** — the calls in `docs/specs/04-local-dev.md §4`.

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
