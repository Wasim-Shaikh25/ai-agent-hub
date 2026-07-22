# Remaining Work — details you can follow

Everything in the core product is built and verified. This file tracks the items
that are **not** built, split into (A) features I can build + verify next, and
(B) items that need external accounts or heavy work (with step-by-step notes so
you can follow along).

## A. Buildable & verifiable — ✅ now DONE

| Item | What it does | Status |
|---|---|---|
| **Eval harness** | `POST /api/rag/eval` reports recall@k / MRR / precision on a labeled set. | ✅ done |
| **Diagnostics-aware retrieval** | Feed compiler/lint errors → referenced files pulled into context (`session_get_context` `diagnostics[]`, `diagnostics_context` tool, `POST /api/rag/diagnostics`). | ✅ done |
| **LLM reranker** | Optional cross-encoder-style rerank of the top-N via the gateway (`rerank=llm`). | ✅ done |
| **Memory decay** | Recency weighting in memory scoring (`MEMORY_HALFLIFE_DAYS`). | ✅ done |
| **Platform admin console** | `/superadmin`: cross-org plan changes + suspend/resume, gated by `is_platform_admin`. | ✅ done |
| **Issue analysis** | Operational event log (`system_event`) with gateway/auth capture + `/api/platform/events(/summary)` + Issues tab. | ✅ done |
| **Operator copilot** | `/api/platform/assistant`, grounded in live stats + 24h issues, with offline fallback. | ✅ done |

## B. Needs your accounts / decisions

### B1. RL / learned memory selection
- Log `{query features, chosen memory, rejected memories, answer-quality signal}`
  on each retrieval (features: cosine, bm25, rerank score, entity/keyword match,
  recency, source trust, rank).
- Start with a **supervised** scorer or contextual bandit; move to PPO only once
  you can measure answer quality. Keep rewards tied to answer/citation
  correctness + thumbs-up, not retrieval similarity.
- This is an ML project (offline training loop + a served scorer). Weeks, and
  needs labeled data — do it after you have real usage.

### B2. Publish the CLI to npm
```bash
cd cli
# set a real "name"/"version"/"repository" in package.json
npm login
npm publish --access public       # publishes @ai-agent-hub/cli
```
Then customers install with `npm i -g @ai-agent-hub/cli`.

### B3. Publish the VS Code extension
```bash
npm run build && npm run package   # produces the .vsix (root project)
npx vsce login <publisher>
npx vsce publish                   # or upload the .vsix in the Marketplace UI
```
Requires a Marketplace publisher account + a `publisher` field in package.json.

### B4. Hosted SaaS
- Build & push `server/Dockerfile` to a registry.
- Run it on Fly.io / Render / ECS / a small K8s cluster (see `DEPLOYMENT.md`),
  with **managed Postgres (pgvector)** + Redis, `/ready` as the readiness probe.
- Put it behind TLS + a domain (`hub.yourdomain.com`).
- Configure real secrets: `JWT_SECRET`, provider keys, `STRIPE_*`, `WORKOS_*`.
- Point the landing page's links at your domain.

### B5. Stripe billing (activate)
- Create a Stripe account + a **metered** price for the Team plan; note its
  `price_id`.
- Set `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`; add the webhook endpoint
  `https://<you>/webhooks/stripe`.
- Replace the placeholder `price_team` in the account page's upgrade call with
  your real `price_id` (or inject it via env).
- The metering (`hub_tokens` meter events) and webhook→plan sync are already wired.

### B6. SOC 2
- The **technical** controls exist: audit log, RBAC, redaction, retention,
  RLS isolation, encryption-in-transit. SOC 2 is a **process**: pick an auditor,
  document policies, run the observation window. Not code.
