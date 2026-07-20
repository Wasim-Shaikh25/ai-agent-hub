# Web Dashboard Spec

> Status: **draft v1**

## 1. Goal

A browsable UI over the platform: cost, usage, per-developer spend, audit,
sessions, and policy — the thing that makes the value visible to a buyer.

## 2. Delivery

Single self-contained page served by the Hub at `GET /dashboard` (no build
step, no external CDN — inline CSS/JS, matches the artifact CSP constraints).
It calls the existing REST API with the operator's API key (entered once, kept
in `localStorage`). Theme-aware, responsive.

## 3. Panels (v1)

- **Overview**: month tokens, USD, requests, cache-hit %, avg latency (stat row).
- **Cost by model**: table + bar (from `/api/metrics/by-model`).
- **Spend over time**: 30-day sparkline (`/api/metrics/timeseries`).
- **By developer**: per-user tokens + cost (`/api/metrics/by-user`).
- **Savings**: cache + routing savings (`/api/metrics/savings`).
- **Audit**: recent governance events (`/api/audit`).
- **Policies**: routing/budget/redaction at a glance (`/api/policies`).

## 4. Non-goals (v1)

No auth UI beyond the API-key field, no write actions except toggling policies
(later). Read-first; operability comes next.

## 5. Verification

Served page returns 200 and is self-contained; hitting it with a valid key
renders live numbers. Verified by fetching `/dashboard` and asserting the API
calls it depends on all return 200.
