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

| Spec | Feature | Verifiable here? |
|---|---|---|
| `07-data-residency-privacy.md` | Storage modes, data classification, retention/delete | ✅ server-side |
| `08-guardrails-pii.md` | PII/secret redaction before store + forward | ✅ server-side |
| `09-semantic-cache.md` | Embedding-similarity response cache (token savings) | ✅ server-side |
| `10-metrics-analytics.md` | Per-dev / per-repo / latency / cache-hit metrics API | ✅ server-side |
| `11-dashboard.md` | Web dashboard (cost, usage, audit, sessions) | ✅ served + API |
| `12-quality-routing.md` | Task/quality-based model routing | ✅ server-side |

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
