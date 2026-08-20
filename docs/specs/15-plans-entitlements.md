# Plans & Entitlements Spec

> Status: **draft v1**. Makes the open-core free/paid split real — enforced in
> code, not just described. Principle (from 00-overview): **local/individual =
> free; collaborative + governed + scale = paid.**

## 1. What we never do

We do **not** manipulate the IDE/agent's internal prompts. Our value is the
context we *offer* (retrieval, memory, map), caching of *whole* prior responses,
routing, and governance — the agent always chooses what to use.

## 2. Tiers

| Capability | Free | Paid |
|---|---|---|
| Context: memory / sessions / hybrid RAG / knowledge map | ✅ (single-user) | ✅ shared across team & agents |
| MCP connection + CLI connect | ✅ | ✅ |
| Gateway: fallback + metering (BYO keys) | ✅ | ✅ |
| PII/secret redaction | ✅ | ✅ |
| Semantic cache | — | ✅ |
| Quality-based routing | — | ✅ |
| Cost dashboard + full analytics | — | ✅ |
| MCP aggregation (downstream servers) | — | ✅ |
| Content approval workflow | — | ✅ |
| Audit log access | — | ✅ |

## 3. Limits

| Limit | Free | Paid |
|---|---|---|
| Seats | 1 | 25 |
| Projects | 2 | unlimited |
| Memory rows | 500 | 100k |
| Gateway requests / month | 2,000 | 100k |

## 4. Enforcement

- `entitlements.ts` maps `plan → { features, limits }`.
- `requireFeature(feature)` — a preHandler returning **402 upgrade_required** when
  the org's plan lacks the feature. Applied to paid REST routes.
- Gateway gates **semantic cache** and **quality routing** on entitlement, and
  enforces the **monthly request limit** (402 when exceeded).
- MCP aggregation is only exposed to entitled plans.
- `GET /api/plan` returns the plan, its features, and current usage vs limits.

## 5. Upgrades

Plan is stored on `org.plan`. The Stripe webhook sets it: an active subscription
→ `paid`; cancellation → `free`. Local dev seeds `paid` so all features are available.

## 6. Not a plan feature: the operator (platform admin)

Plans describe what a **customer** org can do. The **vendor/operator** is
orthogonal: `app_user.is_platform_admin` grants the cross-org `/superadmin`
console regardless of any org's plan, and it is only settable in the database.
Suspending an org (`org.suspended`) blocks it at auth independent of its plan.
See `16-platform-admin.md`.
