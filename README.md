# AI Agent Hub

**The shared brain and control plane for every AI coding agent your team uses.**

Connect Cursor, Claude Code, Windsurf, Copilot, Codex, Cline and more to one
place that gives them **shared context + memory**, **code-aware retrieval**, an
**LLM gateway** (fallback, routing, cost metering), and **enterprise governance**
(RBAC, audit, SSO, cost dashboards) — without touching the agents' internal
prompts.

- 🚀 **Get started:** [`docs/GETTING-STARTED.md`](docs/GETTING-STARTED.md)
- 🧠 **How it works / specs:** [`docs/specs/`](docs/specs/)
- 📦 **Deploy (SaaS or self-host):** [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
- 💳 **Plans & pricing:** [`docs/PRICING.md`](docs/PRICING.md)
- 🔒 **Security:** [`SECURITY.md`](SECURITY.md)
- 📝 **Changelog:** [`CHANGELOG.md`](CHANGELOG.md)
- 🚦 **Launch readiness:** [`docs/LAUNCH-READINESS.md`](docs/LAUNCH-READINESS.md) · legal drafts in [`docs/legal/`](docs/legal/)

### Why it's different from an LLM router

Routers (LiteLLM, 9Router) move *tokens*. AI Agent Hub adds the layer they don't:
**shared context/memory across different agents**, **code-aware hybrid retrieval
+ a knowledge map**, and **team governance**. The gateway is one swappable
component underneath — the value is the brain on top.

---

The original **VS Code extension** (below) is one client — a centralized control
plane for AI behavior content (skills, rules, hooks) synced to any agent target
(Kiro, Cursor, GitHub Copilot, Amazon Q, etc.).

## Platform (server) — new

Beyond the VS Code extension, the repo now contains the **Hub server** — the
paid, server-side control plane that adds shared **context, memory, and RAG**
across agents (over native **MCP**) plus an embedded **LLM gateway** (LiteLLM)
for provider fallback and model routing.

- **Specs:** [`docs/specs/`](docs/specs/) — overview, architecture, data model,
  API/MCP contract, local-dev, roadmap.
- **Run the full stack locally:**
  [`docs/specs/04-local-dev.md`](docs/specs/04-local-dev.md) —
  `cd deploy && cp .env.example .env && docker compose up --build`.
- **Server code:** [`server/`](server/) (Fastify + Postgres/pgvector + MCP).
- **CLI connector:** [`cli/`](cli/) — `aihub connect <agent>` points any agent
  (Cursor, Claude Code, Kiro, Windsurf…) at the Hub in one command; `aihub detect`
  reports which agents are installed/running on the machine.
- **Agents & Models:** the Hub detects which agents are actually connected (from
  the MCP handshake + gateway traffic) and lets you pick the default model — see
  the `/admin` **Agents & Models** tab and
  [`docs/specs/17-agents-models-console.md`](docs/specs/17-agents-models-console.md).

The extension is the free, local **Content Plane**; the server is the
collaborative + governed **Context / Gateway / Governance** planes. See
[`docs/specs/00-overview.md`](docs/specs/00-overview.md) for the open-core split.

### Customer & operator consoles

| Surface | Who | What |
|---|---|---|
| `/login`, `/account` | any customer user | sign up with email/password, Google, Apple, or mobile; plan, usage, API key |
| `/help` | public | searchable help centre and support ticket form |
| `/dashboard` | customer | cost / usage / audit |
| `/admin` | customer org admin/owner | manage **their** workspace (content, policies, keys, team, MCP, audit) |
| `/superadmin` | **you, the operator** | cross-org control, **issue analysis**, support tickets, and a grounded **copilot** — vendor-only, gated by `is_platform_admin` and disabled by default |

The operator console (`/superadmin`) is where you run the SaaS: change any org's
plan, suspend/resume tenants, analyze operational issues (provider errors,
budget/limit hits, redaction blocks, slow calls) across every workspace, triage
support tickets, and ask the copilot what's failing. See
[`docs/specs/16-platform-admin.md`](docs/specs/16-platform-admin.md).

### User support, registration, and AI assistant policy

- **Self-serve help:** `/help` is a public, searchable help centre. It explains
  sign-up, connecting an agent, API keys, model selection, billing, and how to
  open a support ticket.
- **Support tickets:** Authenticated users can submit tickets from `/help` or
  `POST /api/tickets`. Operators review and close them in `/superadmin` or via
  `GET /api/platform/tickets`.
- **Registration options:** `/login` supports email/password, Google OAuth
  (`/auth/oauth/google`), Apple (`/auth/oauth/apple`), and a mobile OTP button
  that is stubbed until an SMS gateway is configured.
- **No end-user AI chat:** The operator copilot is gated by `is_platform_admin`
  and the `ENABLE_AI_ASSISTANT` flag (default `false`). No per-org, per-team, or
  per-user assistant is exposed, so LLM costs stay under operator control.

## What It Does

AI Agent Hub lets teams define reusable AI behavior content in one place
and distribute it to multiple AI coding assistants. Instead of manually
copying prompt files into each agent's config folder, you manage
everything from a single Hub UI and sync with one click.

- **Skills** — reusable instructions that shape how an AI agent writes
  code (e.g., "use meaningful variable names", "prefer composition over
  inheritance").
- **Rules** — guardrails and standards the agent should follow
  (e.g., naming conventions, security practices).
- **Hooks** — event-driven triggers that fire before or after agent
  actions.

## Features

- Visual Hub panel to browse, create, and manage content
- Auto-detect installed AI agent extensions
- One-click setup wizard for agent targets
- Sync content to multiple agents simultaneously
- Builtin demo content to validate your setup
- Schema validation for all content types
- Supports flat and subfolder file layouts per agent

## Installation

This extension is not published on the VS Code Marketplace. Install it
from a `.vsix` file built from this repository.

### Option 1 — Install from GitHub Releases (recommended)

1. Go to the
   [Releases](https://github.com/Wasim-Shaikh25/ai-agent-hub/releases)
   page.
2. Download the latest `ai-agent-hub.vsix` file.
3. Open VS Code and run:

```text
code --install-extension ai-agent-hub.vsix
```

Or use the Command Palette: **Extensions: Install from VSIX...** and
select the downloaded file.

### Option 2 — Build from source

```bash
git clone https://github.com/Wasim-Shaikh25/ai-agent-hub.git
cd ai-agent-hub
npm install
npm run build
npm run package
```

This produces `ai-agent-hub-<version>.vsix` in the project root.
Install it with:

```bash
code --install-extension ai-agent-hub-*.vsix
```

### Option 3 — Install directly from GitHub URL

If you have the GitHub CLI (`gh`) configured:

```bash
gh release download --repo Wasim-Shaikh25/ai-agent-hub \
  --pattern "*.vsix" --dir .
code --install-extension ai-agent-hub.vsix
```

### Installing a Specific Version

Every merged PR creates a tagged GitHub Release (e.g., `v1.2.0`).
To install a particular version:

**Using the GitHub CLI:**

```bash
gh release download v1.2.0 \
  --repo Wasim-Shaikh25/ai-agent-hub \
  --pattern "*.vsix" --dir .
code --install-extension ai-agent-hub.vsix
```

**From the Releases page:**

1. Go to
   [Releases](https://github.com/Wasim-Shaikh25/ai-agent-hub/releases).
2. Find the version you need (e.g., `v1.2.0`).
3. Download the `ai-agent-hub.vsix` from that release's assets.
4. Install it:

```text
code --install-extension ai-agent-hub.vsix
```

**Building a specific version from source:**

```bash
git clone https://github.com/Wasim-Shaikh25/ai-agent-hub.git
cd ai-agent-hub
git checkout v1.2.0
npm install
npm run build
npm run package
code --install-extension ai-agent-hub-*.vsix
```

> **Note:** Installing an older version over a newer one works fine.
> VS Code will use whichever version you install last. To confirm
> the active version, open the Extensions sidebar and search for
> "AI Agent Hub".

### Uninstalling

**From the command line:**

```bash
code --uninstall-extension ai-agent-hub.ai-agent-hub
```

**From VS Code UI:**

1. Open the Extensions sidebar (`Ctrl+Shift+X` / `Cmd+Shift+X`).
2. Search for "AI Agent Hub".
3. Click the gear icon on the extension and select **Uninstall**.
4. Reload VS Code when prompted.

> **Note:** Uninstalling the extension does not remove any files it
> synced to agent target folders (e.g., `.kiro/steering/`,
> `.cursor/rules/`). Delete those manually if you no longer need
> them.

## Quick Start

1. Open VS Code after installing the extension.
2. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
3. Run **AI Agent Hub: Setup** to detect and configure your AI agent
   targets.
4. Run **AI Agent Hub: Open** to launch the Hub panel.
5. Browse the builtin demo skill to verify everything works.
6. Run **AI Agent Hub: Sync to Agents** to push content to your
   configured agents.

## Commands

| Command                              | Description                          |
| ------------------------------------ | ------------------------------------ |
| `AI Agent Hub: Open`                 | Open the main Hub panel              |
| `AI Agent Hub: Setup`                | Run the agent setup wizard           |
| `AI Agent Hub: Add Skill`            | Create a new skill                   |
| `AI Agent Hub: Add Rule`             | Create a new rule                    |
| `AI Agent Hub: Add Hook`             | Create a new hook                    |
| `AI Agent Hub: Sync to Agents`       | Sync all enabled content to agents   |
| `AI Agent Hub: Show Configured Agents` | View configured agent targets      |
| `AI Agent Hub: Connect to Server`    | Store + validate Hub server URL & key |
| `AI Agent Hub: Connect Agents to Hub` | Write native MCP config into agents  |
| `AI Agent Hub: Pull Content from Hub` | Browse the org content registry      |

## Settings

| Setting                                    | Default | Description                        |
| ------------------------------------------ | ------- | ---------------------------------- |
| `aiAgentHub.autoSync.confirmBeforeSync`    | `true`  | Prompt before auto-syncing content |

## Content Structure

Hub content lives in the `hub-content/` directory:

```text
hub-content/
  skills/      — Skill markdown files (.skill.md)
  rules/       — Rule markdown files (.rule.md)
  hooks/       — Hook markdown files (.hook.md)
  workflows/   — Workflow markdown files (.workflow.md)
  agents/      — Agent persona files (.agent.md)
```

Each content file uses YAML front matter for metadata:

```markdown
---
id: my-skill
name: My Custom Skill
type: skill
source: user
enabled: true
description: Short description of what this skill does.
---

# My Custom Skill

Instructions for the AI agent go here.
```

### Content Types

| Type       | Purpose                                          | File Format          |
| ---------- | ------------------------------------------------ | -------------------- |
| **Skill**  | Reusable coding instructions and behaviors       | `.skill.md`          |
| **Rule**   | Guardrails, standards, and naming conventions    | `.rule.md`           |
| **Hook**   | Event-driven triggers (before/after actions)     | `.hook.md`           |
| **Workflow**| Step-by-step processes (review, deploy, etc.)   | `.workflow.md`       |
| **Agent**  | Agent persona definitions and system prompts     | `.agent.md`          |

### File Extension Formats per Agent Target

Different AI agents expect different file formats. The Hub handles
this automatically based on your agent target configuration:

| Agent Target    | Extension Format       | Example Output                    |
| --------------- | ---------------------- | --------------------------------- |
| Kiro            | `.md`                  | `clean-code.md`                   |
| Cursor          | `.mdc`                 | `clean-code.mdc`                  |
| GitHub Copilot  | `-instructions.md`     | `clean-code-instructions.md`      |
| GitHub Copilot  | `.prompt.md`           | `clean-code.prompt.md`            |
| Amazon Q        | `.md`                  | `clean-code.md`                   |

## Supported Agent Targets

AI Agent Hub can sync content to any agent that reads markdown or
config files from the workspace. Tested targets include:

- **Kiro** — syncs to `.kiro/steering/`
- **Cursor** — syncs to `.cursor/rules/` or `.cursor/skills/`
- **GitHub Copilot** — syncs to `.github/instructions/` or
  `.github/prompts/`
- **Amazon Q** — syncs to `.amazonq/rules/` or `.amazonq/prompts/`

The setup wizard auto-detects installed agent extensions and
configures paths automatically.

## Repo-Level Sync

In addition to syncing globally, you can target specific
repositories. This is useful when you want certain skills or rules
to apply only to particular projects.

### How It Works

1. Run **AI Agent Hub: Open** and go to the Repos tab.
2. Click "Add Repo" and provide:
   - A display name (e.g., "my-frontend-app")
   - The local path to the repository
   - Which agent target config to use (e.g., Cursor, Kiro)
   - Which content types to sync (skills, rules, hooks, etc.)
   - Optionally, specific items to include (default: all enabled)
3. On the next sync, content is written directly into that repo's
   agent config folder.

### Example

You have a Cursor-configured agent target. You add a repo at
`C:\projects\my-app` and select only "skills" and "rules". On sync,
the Hub writes your enabled skills and rules into
`C:\projects\my-app\.cursor\rules\` (or whichever path your Cursor
target is configured to use).

You can add as many repos as you need. Each repo can have different
content types and even different item selections.

## Versioning

This project uses automated semantic versioning via GitHub Actions.
When a PR is merged to `main`:

- PRs with a `major` label bump the major version (e.g., 1.0.0 →
  2.0.0).
- PRs with a `minor` label or a title starting with `feat` bump the
  minor version (e.g., 1.0.0 → 1.1.0).
- All other PRs bump the patch version (e.g., 1.0.0 → 1.0.1).

A GitHub Release is created automatically with the `.vsix` artifact
attached.

## Development

### Prerequisites

- Node.js 20+
- npm 9+

### Setup

```bash
npm install
```

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

### Debug

Press `F5` in VS Code to launch an Extension Development Host with
the extension loaded.

### Package

```bash
npm run package
```

## Contributing

1. Create a feature branch from `main`.
2. Make your changes.
3. Open a PR against `main`.
4. CI runs build and tests automatically.
5. On merge, the release workflow bumps the version and publishes a
   new VSIX.

### PR Title Conventions

Use [Conventional Commits](https://www.conventionalcommits.org/)
style for PR titles to control version bumps:

- `feat: add new feature` → minor bump
- `fix: resolve bug` → patch bump
- Add a `major` label for breaking changes

## License

MIT License
