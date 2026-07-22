# AI Agent Hub — Product Overview & Specs

> Status: **draft v1** · Owner: Wasim Shaikh · Last updated: 2026-07-19

## 1. What we are building

**AI Agent Hub** is the shared **brain and control plane** for every AI
coding agent a team uses (Cursor, Kiro, GitHub Copilot, Windsurf, Claude
Code, Codex, Cline, …). One place to manage:

- **Behavior** — skills, rules, hooks, workflows, personas synced to each agent.
- **Context** — shared sessions, external memory, and per-session RAG, exposed
  to every agent **natively over MCP**.
- **Models** — provider fallback, model selection, and "which model for which
  task" routing via an embedded LLM gateway (LiteLLM).
- **Governance** — RBAC, audit, cost caps, org content registry.

## 2. Positioning (why not "just LiteLLM / 9Router")

Routers (9Router, OmniRoute, LiteLLM) move **tokens**. They are stateless,
single-agent, and free/commoditized. We are the **context + governance layer
above any router**:

- Shared context/memory **across different agents** (Cursor → Kiro continuity).
- Behavior governance (skills/rules) synced into each agent.
- Per-session RAG + a context assembler that sends the *minimal correct* context.
- Team policy, audit, cost — enterprise controls no free router has.

The gateway (LiteLLM) is an **internal, swappable component** — ~15% of the
surface area. The Context + Governance planes are the product.

**One-liner:** *Not another LLM router — the shared brain and control plane for
every AI coding agent your team uses.*

## 3. Open-core monetization split

| Capability | Free (local, OSS) | Paid (server) |
|---|---|---|
| Content sync (skills/rules/hooks/workflows/personas) | ✅ | ✅ + versioned org registry & approvals |
| MCP config writing per agent | ✅ | ✅ |
| Context & memory | single-user, local SQLite | **shared across team & agents**, hosted |
| RAG | local repo only | team knowledge base, hosted vectors |
| LLM gateway | BYO / self-run | managed fallback, cost caps, audit |
| Governance | — | RBAC, policy, audit log, cost dashboards, SSO |
| Deployment | local | SaaS **or** self-host in customer VPC (enterprise) |

Principle: **local = free, collaborative + governed = paid.** The paid features
genuinely require a server, so there is no "why can't I self-host the free bit"
resentment.

## 4. The three planes

1. **Content Plane** — already exists in the VS Code extension. Distributes
   behavior content to each agent's native config folder.
2. **Context Plane** — *the differentiator.* Sessions, memory, RAG, context
   assembler. Exposed as MCP tools so any agent uses it with zero integration.
3. **Gateway Plane** — LiteLLM sidecar. Fallback, model selection, task→model
   routing, cost/audit. Swappable.

## 5. Two traffic paths (design invariant)

Each agent has **two independent connections** to the Hub:

- **Context path — MCP:** low-volume, high-value. `session.*`, `memory.*`,
  `rag.query`, `skills.list`. This is the SaaS.
- **Inference path — gateway:** high-volume. Agent `base_url` → Hub → LiteLLM →
  providers. **Optional and self-hostable** so a team can keep tokens/code in
  their own network while still paying for hosted context/governance.

## 6. Clients

- **VS Code extension** (existing) — refactored to a thin client; also writes
  native MCP config pointing agents at the Hub.
- **CLI daemon** — for non-VS-Code agents (Claude Code, Codex, Cline, CI). Same
  core, no editor dependency.
- The **Hub server** is the product; each client is one front-end.

### Operator control plane (vendor-only)

Above the customer surfaces sits `/superadmin` — a console for **you, the
vendor** who runs the SaaS: manage every org's plan, suspend/resume tenants,
**analyze operational issues** across all workspaces, and ask a grounded
copilot what's failing. Gated by `app_user.is_platform_admin`. Full detail in
`16-platform-admin.md`.

## 7. Spec index

| Doc | Contents |
|---|---|
| `01-architecture.md` | Topology, components, tech stack, deployment |
| `02-data-model.md` | Entities + Postgres schema |
| `03-api-and-mcp.md` | REST endpoints + MCP tool contracts |
| `04-local-dev.md` | Run the full stack locally (docker compose) |
| `05-roadmap.md` / `06-roadmap-v2.md` | Phased delivery plan & status |
| `07`–`14` | Data residency, guardrails, cache, metrics, dashboard, routing, scoping, code-aware RAG |
| `15-plans-entitlements.md` | Open-core free/paid split, enforced in code |
| `16-platform-admin.md` | Operator console: cross-org control, issue analysis, copilot |
