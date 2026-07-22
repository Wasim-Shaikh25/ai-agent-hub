# Agents & Models Console — Requirements & Design

> Status: **building (Phase 1)** · Owner: Wasim Shaikh · Depends on: gateway
> (`04`), MCP server (`03`), policies (`12`), platform console (`16`).

## 1. Problem / intent

Give users **one branded place** to see which AI coding agents are talking to
the Hub, what models are available, and to choose the model — without building a
coding agent from scratch and without touching any agent's internal prompts.

Two realities shape the design (see conversation + `16`):

- **Closed agents (Cursor, Kiro, Amazon Q, Claude Code) cannot be forked,
  rebranded, or have their model picker driven from outside.** We *integrate*
  with them (they connect to the Hub); we do not reach into their UI.
- **Model choice is a gateway/routing decision, not a per-agent one.** The Hub
  already owns the model catalog and routing, so "pick a model" = set the Hub's
  default/routing, which every connected agent then rides.

## 2. Phasing (decision: "both, phased")

- **Phase 1 — Branded control panel (this spec, now).** Detect *connected*
  agents via MCP, list available models, let the user pick the default model
  (enforced Hub-side), and launch CLI agents through the Hub. Server-side, lands
  in the existing console. Low effort, no fork to maintain.
- **Phase 2 — Own branded agent (later).** Fork an Apache-2.0 UI agent
  (Continue or Cline), rebrand, and route it through the Hub. Fully owns its UI +
  model picker. Tracked in §9; not built here.

## 3. Detection model (the key idea)

Detection has two complementary sources — we use **both**, for different jobs:

| Source | Detects | Where | Used for |
|---|---|---|---|
| **MCP `initialize` handshake** (`clientInfo.name/version`) | agents **actually connected** to the Hub (any agent) | server-side | the console's live "Connected agents" list |
| **Gateway request** (`x-hub-agent` / `User-Agent` + `model`) | agent + **the model it just used** | server-side | "agent → last model" attribution |
| VS Code extension (`agentDetector.ts`, existing) | agents **installed but idle** | client-side (VS Code only) | onboarding / connect step |

`clientInfo.name` is self-reported; we **normalize** known names → display names
and fall back to the raw string. Detection never blocks the request.

## 4. Functional requirements

### FR1 — Capture connected agents
- On MCP `initialize`, record `{org, user?, agent, version, source=mcp, project}`.
- On a gateway call, record `{org, user, agent (from header/UA), source=gateway,
  last_model}`.
- Upsert per `(org, agent, source)`: increment `seen_count`, update `last_seen`,
  `last_model`, `version`. Best-effort — never throws into the request path.

### FR2 — List agents
- `GET /api/agents` → connected agents for the caller's org, newest-seen first,
  with `agent, version, source, last_model, seen_count, first_seen, last_seen`.

### FR3 — Model catalog
- `GET /v1/models` → OpenAI-standard `{object:"list", data:[{id, object:"model"}]}`
  from `deploy/litellm.config.yaml` (chat models only; embedding models filtered).
  Overridable with `HUB_MODELS` env (comma list). Requires auth.
- `GET /api/models` → same list in a UI-friendly shape, plus the org's current
  default model.

### FR4 — Choose the model (user-oriented, Hub-enforced)
This product is **user-oriented**: each developer picks their **own** model,
self-serve. The admin default is only a fallback.

- `PUT /api/me/model { model }` (any member) → sets the caller's own model
  (`user_model_pref`); empty clears it. `GET /api/me/model` reads it.
- `PUT /api/settings/default-model { model }` (admin) → org **fallback** default,
  a single `model` policy `{ default_chain: [model] }`. Never overrides a user.
- **Precedence** when the agent doesn't pin a model:
  `user's own choice` → org quality-routing (if no user choice) → org default →
  catalog default. The user's explicit choice **beats org quality routing** —
  it's an intentional selection. An explicit model in the request always wins;
  we never override what the agent asked for or touch its internal picker.

### FR5 — Console UI (branded)
- New **Agents** tab in `/admin`: connected-agents table, model catalog, and a
  default-model selector. Vanilla, theme-aware, matches the existing console.

### FR6 — Terminal launcher (CLI agents)
- `aihub run` → menu: pick agent (auto-detected from `PATH`: aider, claude,
  codex, …) + pick model (from `/v1/models`) → sets the right env (base URL →
  Hub, key, model) and execs the agent.
- `aihub models` / `aihub agents` → list catalog / connected agents.

## 5. Data model

`agent_connection` (migration 014):

| col | type | notes |
|---|---|---|
| id | uuid pk | |
| org_id | uuid → org | |
| user_id | uuid → app_user, null | null for MCP without a user key |
| agent | text | normalized display name |
| raw_name | text | as reported by the client |
| version | text | |
| source | text | `mcp` \| `gateway` |
| last_model | text | last model seen (gateway) |
| project | text | from `x-hub-project` |
| seen_count | int | incremented on upsert |
| first_seen / last_seen | timestamptz | |

Unique `(org_id, agent, source)` for upsert. Indexed on `(org_id, last_seen)`.

## 6. API summary

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/agents` | member | connected agents for the org |
| GET | `/v1/models` | member | OpenAI-standard model list |
| GET | `/api/models` | member | catalog + org default + **the caller's own choice** |
| GET/PUT | `/api/me/model` | member | **read/set the caller's own model** (self-serve) |
| PUT | `/api/settings/default-model` | admin | org fallback default (never overrides a user) |

## 7. Non-goals

- No forking/rebranding of closed agents (impossible/again: not allowed).
- No overriding an agent's internal model dropdown.
- No prompt manipulation (unchanged invariant).
- No local machine scanning from the server (detection of *installed* agents
  stays in the extension).

## 8. Acceptance criteria (Phase 1)

1. An MCP `initialize` from a client with `clientInfo.name="cursor"` creates/updates
   an `agent_connection` row; `GET /api/agents` shows it.
2. A gateway call with `x-hub-agent: aider` records `source=gateway` + `last_model`.
3. `GET /v1/models` returns the catalog from the yaml (no embeddings).
4. `PUT /api/settings/default-model` sets a `model` policy; a subsequent gateway
   call with no routing uses that model.
5. `/admin` **Agents** tab renders agents + models + a working default selector.
6. `aihub run` lists installed CLI agents + models and launches one through the Hub.

## 9. Phase 2 notes (fork a branded agent)

- Candidates: **Continue** or **Cline** (Apache-2.0, real chat UI, custom
  OpenAI-compatible base URL). Rebrand = swap name/icons, keep `NOTICE`/license.
- Point its provider at `<hub>/v1` with the org key; its context comes from the
  Hub over MCP exactly like Cursor's does today.
- Cost: maintain the fork (periodic upstream merges). Decide base after Phase 1
  ships and we see real usage.
