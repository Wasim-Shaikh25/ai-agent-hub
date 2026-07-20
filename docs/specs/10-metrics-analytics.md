# Metrics & Analytics Spec

> Status: **draft v1**

## 1. Goal

Turn the raw `usage_event` stream into the numbers a platform team and finance
need — and feed the dashboard (spec 11).

## 2. What we already capture

`usage_event(kind='tokens')` with `{model, input, output, usd, cached?, stream?}`
plus `user_id` and `created_at`. That's enough to derive everything below;
we add `latency_ms` and `cache` fields going forward.

## 3. Endpoints (member+, cost data is admin-sensitive)

| Path | Returns |
|---|---|
| `GET /api/metrics/summary` | month totals: requests, tokens, USD, cache-hit %, avg latency |
| `GET /api/metrics/by-model` | per-model calls/tokens/USD/latency |
| `GET /api/metrics/by-user` | per-developer usage + cost |
| `GET /api/metrics/timeseries?days=30` | daily tokens + USD (for charts) |
| `GET /api/metrics/savings` | tokens/USD saved by cache + fallback-to-cheaper |

## 4. Latency

The gateway records wall-clock time per upstream call into
`usage_event.meta.latency_ms`; metrics aggregate p50/p95.

## 5. Verification

Generate mixed traffic (models, a cache hit, a fallback), then assert each
endpoint returns internally-consistent totals (sum of by-model == summary).
