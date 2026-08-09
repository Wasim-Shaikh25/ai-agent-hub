# Roadmap v2 — Productization suite

> Status: **living doc**. Builds on Phases 0–4 (all shipped). This suite turns a
> verified technical foundation into something an enterprise can adopt.

## Why this suite

Phases 0–4 delivered the differentiated engine (context, gateway, governance,
MCP aggregation). What stands between "impressive demo" and "enterprise buys it"
is: **visibility** (a dashboard), **privacy controls** (data residency + PII
redaction), **cost efficiency** (semantic caching), **quality** (smart routing),
and **measurement** (analytics).

## Specs in this suite

| Spec | Feature | Status |
|---|---|---|
| `07-data-residency-privacy.md` | Storage modes, purge/right-to-be-forgotten, retention | ✅ done |
| `08-guardrails-pii.md` | PII/secret redaction before store + forward | ✅ done |
| `09-semantic-cache.md` | Embedding-similarity response cache (token savings) | ✅ done |
| `10-metrics-analytics.md` | latency / cache-hit / by-model / by-user / savings metrics | ✅ done |
| `11-dashboard.md` | Web dashboard at `/dashboard` (cost, usage, audit) | ✅ done |
| `12-quality-routing.md` | Prompt classification → tier → model, with escalation | ✅ done |

**All six shipped and verified.** Lighter items (more IdPs, prompt-caching
passthrough, SOC2 process) remain as noted below.

## Build order (each ships + verifies + commits independently)

1. **Data residency + privacy** (07) — addresses the core privacy question first.
2. **PII/secret redaction** (08) — depends on 07's classification.
3. **Semantic cache** (09) — token savings; independent.
4. **Metrics/analytics API** (10) — feeds the dashboard.
5. **Dashboard** (11) — consumes 10.
6. **Quality routing** (12) — extends the gateway policy engine.

## Lighter items (extend existing, folded into the above)

- **More IdPs** — the SSO provider interface (3.5) already generalizes; adding
  Okta/Azure AD is a new `SsoProvider` implementation.
- **Prompt-caching awareness** — gateway passes through Anthropic/OpenAI prompt
  caching headers; surfaced in metrics (10).
- **SOC2** — process, not code: audit log (done), RBAC (done), encryption,
  retention (07) are the technical prerequisites; tracked separately.
