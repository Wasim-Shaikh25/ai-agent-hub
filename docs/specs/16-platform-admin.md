# Platform Admin, Issue Analysis & Operator Copilot Spec

> Status: **built** · Surface: `/superadmin` · Audience: the **vendor/operator**
> who runs the SaaS — not customers.

## 1. Goal

Give the operator a single console to run the whole platform: see every
workspace, change plans, suspend/resume tenants, **analyze operational issues**
across all orgs, and ask a grounded **copilot** what's going wrong — without
touching the database by hand.

This is distinct from the two customer surfaces:

| Surface | Who | Scope |
|---|---|---|
| **`/superadmin`** | Platform super-admin (the vendor) | **All** orgs — the whole platform |
| `/admin` | Customer org admin/owner | Their **own** workspace |
| `/account`, `/dashboard` | Any customer user | Their own plan, usage, keys |

## 2. Access model

- A user is a platform admin iff `app_user.is_platform_admin = true`. This flag
  is **only** settable in the database — there is no self-serve path, which is
  what you want for a vendor-only control plane. The dev seed flags
  `dev@localhost`.
- `requireSuperadmin` (`server/src/auth.ts`) gates every `/api/platform/*`
  route. A normal user — even an org **owner** — gets `403 "Platform admin only"`.
- The `/superadmin` page HTML is served to anyone, but it is an empty shell:
  every data call returns `403` unless you are a platform admin, so no data
  leaks. (Optionally gate the page load too.)

## 3. Organization control

`GET /api/platform/orgs` lists every org with plan, suspended state, seat count,
and month-to-date tokens. `PUT /api/platform/orgs/:id` changes:

- **plan** — `free | team | enterprise`; invalidates the entitlement cache
  immediately (`invalidatePlan`) so the change takes effect on the next request.
- **suspended** — `true|false`. A suspended org is blocked at auth with
  `403 org_suspended` **before** any handler runs.

Both actions are written to the audit log (`platform.org_update`).

### Suspension exemption (self-lockout guard)

Platform admins are **exempt** from the suspension block in `requireAuth`
(`isSuspended(org) && !isPlatformAdmin(user)`). Without this, suspending your
own org would lock you out of the very controls that un-suspend it (your key
belongs to that org). Normal users in a suspended org are still blocked, so the
exemption stays narrow.

## 4. Issue analysis (operational event log)

The point of the "logging" feature: **from logs, spot and diagnose issues** —
not harvest training data.

### Capture

`EventService` (`server/src/services/eventService.ts`) records structured events
to `system_event`. Recording is **best-effort** — it never throws into the
request path — and messages are **redacted** before storage. The gateway and
auth layers emit at every failure point:

| code | level | source | when |
|---|---|---|---|
| `provider_error` | error | gateway | upstream LLM returned non-2xx (status + model in meta) |
| `gateway_error` | error | gateway | the forward threw |
| `budget_exceeded` | warn | gateway | monthly budget ceiling hit |
| `limit_reached` | warn | gateway | plan's monthly request cap hit |
| `redaction_block` | warn | gateway | request blocked for secrets/PII (block mode) |
| `slow_request` | warn | gateway | upstream call exceeded `SLOW_REQUEST_MS` (default 20s) |
| `org_suspended` | warn | auth | a suspended workspace was turned away |

### Analysis API

- `GET /api/platform/events/summary?hours=24` — totals by level, top codes (with
  last-seen), by source, and the orgs with the most **errors** in the window.
- `GET /api/platform/events?level=&source=&code=&orgId=&limit=` — recent events,
  newest first, filterable. Also the JSON export.

### Console

The **Issues** tab renders severity tiles (errors / warnings / total over 24h),
the worst-affected orgs, clickable **code-filter chips**, and a color-coded
event log. The **Overview** tab carries an at-a-glance issues card.

## 5. Operator copilot

`POST /api/platform/assistant` answers the operator's question grounded in a
live platform snapshot that **includes the 24h issue summary** (totals, top
codes, worst orgs). So it can answer "what is failing right now?" and "which
orgs have the most errors?" from real data, never invented numbers.

- Uses the internal LLM helper (`llmComplete`, the same cheap-model path as
  summarization). Set `SUMMARY_MODEL` + `LITELLM_URL`/master key to enable it.
- **Graceful fallback:** with no model reachable it returns the raw snapshot
  (a still-useful, deterministic answer) instead of dead-ending. The response
  carries `{ llm: true|false }` so the UI can label offline answers.

## 6. Feedback labels (adjacent)

`POST /api/feedback` (any authenticated user) records 👍/👎 on a completion into
`training_sample` (redacted). This is **user feedback**, not gateway harvesting —
thumbs-down is a natural signal to wire to alerts. `GET /api/platform/training`
lists the labels for the operator.

## 7. Config

| Env | Default | Purpose |
|---|---|---|
| `SLOW_REQUEST_MS` | `20000` | latency threshold for the `slow_request` event |
| `SUMMARY_MODEL` | `gpt-4o-mini` | model the copilot (and summarizer) uses |

## 8. Data model touchpoints

Migration `012_platform.sql`: `app_user.is_platform_admin`, `org.suspended`,
`training_sample`. Migration `013_events.sql`: `system_event` (+ recent/code/org
indexes). See `02-data-model.md`.
