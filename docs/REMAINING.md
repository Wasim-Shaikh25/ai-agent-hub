# Remaining Work — details you can follow

Everything in the core product is built and verified. This file tracks the items
that are **not** built, split into (A) features I can build + verify next, and
(B) items that need external accounts or heavy work (with step-by-step notes so
you can follow along).

## A. Buildable & verifiable next (server-side)

| Item | What it does | Effort |
|---|---|---|
| **Eval harness** | Index a labeled set; report recall@k / MRR / context-efficiency so retrieval changes are measurable. Endpoint `GET /api/rag/eval`. | ~0.5 day |
| **Diagnostics-aware retrieval** | Feed compiler/lint errors; pull the referenced files/symbols into context (`session_get_context` accepts `diagnostics[]`). | ~0.5–1 day |
| **LLM reranker** | Optional cross-encoder-style rerank of the RRF top-N via the gateway for high-value queries (behind a `rerank=llm` flag). | ~0.5 day |
| **Memory decay** | Recency/usage weighting in memory scoring so stale memories fade unless reinforced. | ~0.25 day |

(Say the word and I'll build these — each is verifiable here.)

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
