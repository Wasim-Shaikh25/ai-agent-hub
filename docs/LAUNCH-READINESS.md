# Launch Readiness

> Honest state: the software is a working **MVP** — it builds, has an integration
> test suite, and all core flows are verified **against a mock LLM on localhost**.
> It is **not yet ready to sell**. This is the prioritized path from here to a
> first paying customer, then to enterprise GA. Check items off as you go.

Legend: 🔴 blocker · 🟠 needed for paid · 🟢 enterprise/GA · ✅ done

## P0 — cannot take money without these

- [ ] 🔴 **Run against real LLM providers.** Everything is verified with a mock.
  Wire real OpenAI/Anthropic keys into `deploy/litellm.config.yaml`, and confirm:
  real chat + streaming, accurate token/cost metering, fallback on a real 429,
  and the semantic cache. *Owner action: provide keys.*
- [ ] 🔴 **Real embeddings for RAG.** `EMBEDDINGS_PROVIDER=local` is a hash
  fallback (not semantic). Switch to `minilm` or a provider embedding model and
  re-check retrieval quality on a real repo. (`@xenova/transformers` install was
  blocked by the proxy — resolve or use a provider embedding endpoint.)
- [ ] 🔴 **Deploy to real infrastructure.** It has only ever run on localhost.
  Need: a host (Fly/Render/ECS/K8s), managed Postgres **with pgvector**, Redis,
  TLS + domain, `/ready` as the readiness probe. See `docs/DEPLOYMENT.md`.
- [ ] 🔴 **Backups — and a tested restore.** Automated Postgres backups plus one
  rehearsed restore. You're storing customers' context/memory; data loss = dead.
- [ ] 🔴 **Legal (you store customer code/context).** Terms of Service, Privacy
  Policy, and a Data Processing Addendum. Draft skeletons in `docs/legal/` —
  **have a lawyer review before publishing.**
- [ ] 🔴 **Payments actually live.** Real Stripe account, real metered price IDs,
  a completed test purchase, and the webhook verified end-to-end. Replace the
  placeholder `price_team`. (Code is wired; the account + config are not.)
- [ ] 🔴 **Secrets & config hardening.** Set a strong `JWT_SECRET`, rotate the dev
  seed key, `LOG_PROMPTS=false`, `REDACTION_ENABLED=true`, `CORS_ORIGIN` locked
  to your domain, `RATE_LIMIT_PER_MIN` tuned. No default creds in prod.

## P1 — needed for a credible paid launch

- [x] ✅ **Automated test suite + CI** (`server/test/`, `npm test`, Server CI).
- [ ] 🟠 **Monitoring & alerting.** Error tracking (Sentry or similar), uptime
  checks on `/ready`, and alerts on the `system_event` error stream you already
  capture. Right now failures are only visible in the console.
- [ ] 🟠 **Load / concurrency test.** Never tested beyond single-request smoke.
  Especially validate the RLS path (per-query transaction holds a connection —
  size the pool) and the gateway under concurrent streams.
- [ ] 🟠 **Onboarding that a stranger can complete.** Sign up → connect an agent →
  see value, with zero hand-holding. Test with someone who isn't you.
- [ ] 🟠 **Support channel + status page.** An email/inbox that's monitored and a
  public status page. Define who's on call.
- [ ] 🟠 **Pricing finalized** and reflected in the app + `docs/PRICING.md`.

## P2 — enterprise / GA (mostly process, not code)

- [ ] 🟢 **SOC 2.** Technical controls exist (audit log, RBAC, RLS, redaction,
  retention, TLS). SOC 2 is a *process*: pick an auditor, write policies, run the
  observation window. Months.
- [ ] 🟢 **Independent security review / pen test.** The dormant-RLS and empty-GUC
  bugs (now fixed) show why: get outside eyes before enterprise buyers do.
- [ ] 🟢 **SSO against a real IdP.** Code supports dev + WorkOS; test the real
  WorkOS/Okta/Entra flow end-to-end.
- [ ] 🟢 **SLA + incident process.** Uptime commitment, incident runbook,
  postmortems.
- [ ] 🟢 **Data residency / self-host packaging** for customers who require VPC
  deployment (`STORAGE_MODE=central`, self-host path already documented).

## Recommended sequence

1. **Design partners first, not a launch.** Get 1–3 teams to use it on real work
   (free/cheap, high tolerance). Their real workloads prove the LLM/RAG path,
   surface bugs, and — most importantly — tell you if anyone will pay.
2. Do the **P0** items driven by what those partners actually hit.
3. Harden (**P1**) around real usage; pursue **P2** only once a paying enterprise
   pipeline exists.

## What's genuinely solid today (don't re-litigate)

Auth (API keys, JWT, password, SSO scaffolding), open-core entitlements (free/
team/enterprise enforced in code), shared context/memory/RAG over MCP,
code-aware hybrid retrieval + knowledge map, the LLM gateway (fallback, routing,
semantic cache, budgets, metering), governance (RBAC, audit, policies, cost
dashboards), the admin/account/dashboard/superadmin consoles, connected-agent
detection, PII/secret redaction, retention, and DB-enforced tenant isolation
(RLS). All covered by the test suite.
