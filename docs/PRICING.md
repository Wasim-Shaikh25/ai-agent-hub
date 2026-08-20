# Pricing & Plans

Open-core: **local/individual is free; collaboration, scale, and governance are
paid.** Enforced in code (`entitlements.ts`); `GET /api/plan` reports what an org
has unlocked.

| | **Free** | **Paid** |
|---|---|---|
| Context: memory / sessions / hybrid RAG / knowledge map | single-user | shared across team & agents |
| MCP connection + CLI + repo auto-index | ✅ | ✅ |
| Gateway: fallback + metering (BYO keys) | ✅ | ✅ |
| PII/secret redaction | ✅ | ✅ |
| Semantic cache | — | ✅ |
| Quality-based routing | — | ✅ |
| Cost dashboard + analytics | — | ✅ |
| MCP aggregation (downstream servers) | — | ✅ |
| Content approval workflow + audit log | — | ✅ |
| Seats | 1 | 25 |
| Projects | 2 | unlimited |
| Memory rows | 500 | 100k |
| Gateway requests / month | 2,000 | 100k |

Billing is metered through Stripe (usage → Stripe Billing Meter); the plan is set
automatically on subscription (active → Paid; cancel → Free).

> Note: customers always pay their own LLM providers for tokens — the Hub routes
> and governs, it doesn't resell inference.
