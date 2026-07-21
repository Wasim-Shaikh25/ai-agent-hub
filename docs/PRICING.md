# Pricing & Plans

Open-core: **local/individual is free; collaboration, scale, and governance are
paid.** Enforced in code (`entitlements.ts`); `GET /api/plan` reports what an org
has unlocked.

| | **Free** | **Team** | **Enterprise** |
|---|---|---|---|
| Context: memory / sessions / hybrid RAG / knowledge map | ✅ single-user | ✅ shared across team & agents | ✅ |
| MCP connection + CLI + repo auto-index | ✅ | ✅ | ✅ |
| Gateway: fallback + metering (BYO keys) | ✅ | ✅ | ✅ |
| PII/secret redaction | ✅ | ✅ | ✅ |
| Semantic cache | — | ✅ | ✅ |
| Quality-based routing | — | ✅ | ✅ |
| Cost dashboard + analytics | — | ✅ | ✅ |
| MCP aggregation (downstream servers) | — | ✅ | ✅ |
| Content approval workflow + audit log | — | ✅ | ✅ |
| SSO (WorkOS/IdP) | — | — | ✅ |
| Hard tenant isolation (RLS) | — | — | ✅ |
| Self-host in your VPC | — | — | ✅ |
| Seats | 1 | 25 | unlimited |
| Projects | 2 | unlimited | unlimited |
| Memory rows | 500 | 100k | unlimited |
| Gateway requests / month | 2,000 | 100k | unlimited |

Billing is metered through Stripe (usage → Stripe Billing Meter); the plan is set
automatically on subscription (active → Team; cancel → Free). Enterprise is
assigned on contract.

> Note: customers always pay their own LLM providers for tokens — the Hub routes
> and governs, it doesn't resell inference.
