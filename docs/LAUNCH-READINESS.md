# Launch Readiness

> Honest state: the software is a working **MVP** — it builds, has an integration
> test suite, and all core flows are verified **against a mock LLM on localhost**.
> It is **not yet ready to sell**. This is the prioritized path from here to a
> first paying customer, then to enterprise GA. Check items off as you go.

Legend: 🔴 blocker · 🟠 needed for paid · 🟢 enterprise/GA · ✅ done

## Scope note: we provide NO LLM

This product provides **services to agents (Cursor, Kiro, and others)** — shared
context, memory, code-aware retrieval, and governance over MCP. It does **not**
sell or provide LLM inference; each agent uses its own model. The repo contains
an *optional* LLM gateway and a few LLM-assisted niceties (session summaries,
memory extraction, RAG reranker, operator copilot) — **all optional, all with
deterministic fallbacks** — so the product runs with zero LLM configured. See
`docs/specs/17` / `18` history for why closed agents can't be driven anyway.

## P0 — cannot take money without these

- [x] ✅ **In-process semantic embeddings are the default** (`EMBEDDINGS_PROVIDER=minilm`
  in code + all deploy configs). Real vectors, runs inside the Hub, no API key,
  no provider. Falls back to a local hash automatically if the model dep is
  missing.
- [ ] 🔴 **Ship the model in your production image.** `@xenova/transformers` is an
  optional dep; make sure `npm ci` installs it in your build (it was blocked by
  the proxy in *this* sandbox only), and **pre-download the MiniLM weights into
  the image** (set `TRANSFORMERS_CACHE`) so first request doesn't depend on a
  runtime fetch from HuggingFace. Then re-check retrieval quality on a real repo.
  Note: if you switch providers after data exists, **re-index** — vectors from
  different models aren't comparable.
- [ ] 🟢 **(Optional) LLM gateway** — only if you *choose* to offer inference
  routing to the agents that can point a base URL at you (aider, Claude Code),
  and only **BYO-key** (the customer's key). Not required for Cursor/Kiro, not a
  vendor-LLM business. Leave it off if it's not part of your offering.
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
- [x] ✅ **Superadmin auth & org provisioning.** Env-fed operator (`SUPERADMIN_*`),
  OTP login (`/auth/superadmin/*`), superadmin org creation with `admin_email`,
  and domain-based SSO/OAuth auto-join are implemented and tested.
- [ ] 🔴 **Secrets & config hardening.** Set a strong `JWT_SECRET`, rotate the dev
  seed key, change the default `SUPERADMIN_PASSWORD`, `LOG_PROMPTS=false`,
  `REDACTION_ENABLED=true`, `CORS_ORIGIN` locked to your domain,
  `RATE_LIMIT_PER_MIN` tuned. No default creds in prod.

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
- [x] ✅ **SSO against a real IdP.** Code supports `dev` (offline) + `workos` and
  domain-based auto-join by `admin_email`. Test the real WorkOS/Okta/Entra flow
  end-to-end with a real domain.
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

**Core (the product):** auth (API keys, JWT, password, superadmin OTP,
domain-based SSO/OAuth auto-join, org provisioning), open-core entitlements
(free/team/enterprise enforced in code), shared context/memory/RAG over MCP,
code-aware hybrid retrieval + knowledge map, governance (RBAC, audit, policies,
cost dashboards, user activity), the admin/account/dashboard/superadmin consoles,
connected-agent detection, PII/secret redaction, retention, and DB-enforced
tenant isolation (RLS). All covered by the test suite.

**Optional (off by default in your model):** the LLM gateway (BYO-key routing,
fallback, semantic cache, budgets, metering) and the LLM-assisted niceties
(summaries, memory extraction, reranker, copilot) — each with a no-LLM fallback.
