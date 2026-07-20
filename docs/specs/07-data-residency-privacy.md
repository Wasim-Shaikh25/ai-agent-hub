# Data Residency & Privacy Spec

> Status: **draft v1**

Answers: *"Is data stored on my server or in each developer's local storage?"*

## 1. Where data lives

| Mode | Where | Use |
|---|---|---|
| **central** (default) | the Hub server's Postgres — your infra (SaaS or self-host VPC) | team sharing, governance, audit |
| **local** | per-developer SQLite on their machine, no server | individual/free tier, maximum privacy |

Set by `STORAGE_MODE=central|local`. In `local` mode the server is optional; a
developer runs a local Hub with SQLite and nothing leaves their machine. In
`central` mode all context is on your server and **never** in Claude/Anthropic
or on developer laptops. Self-host `central` in a VPC → data never leaves the
customer network.

## 2. Data classification (scopes)

Every memory/session/document carries a `visibility`:

| Scope | Who can read | Stored |
|---|---|---|
| `org` | everyone in the org | central |
| `project` | members of that project | central |
| `private` | only the author | central, author-filtered |
| `local` | only the author's machine | never sent to central server |

Enforced in the query layer (author/project filters) and, for `private`, at the
API/MCP tool level. `local` items are handled entirely by the local client.

## 3. Retention & right-to-be-forgotten

- Per-org retention policy (`retention` policy kind): `{ days: N }` — a sweep
  deletes memory/turns/usage older than N days.
- `DELETE /api/privacy/purge` (admin) — purge a user's or project's data.
- `DELETE /api/memory/:id`, session delete — targeted removal.

## 4. What is sent to the LLM provider

Only the assembled prompt for a single call, **after** PII redaction (spec 08).
The provider retains nothing (Anthropic/OpenAI zero-retention terms apply). The
Hub logs token counts + cost, never prompt bodies, unless `LOG_PROMPTS=true`.

## 5. Config summary

| Var | Default | Meaning |
|---|---|---|
| `STORAGE_MODE` | `central` | `central` or `local` |
| `LOG_PROMPTS` | `false` | store prompt bodies (off for privacy) |
| `DEFAULT_VISIBILITY` | `project` | scope for new context |
