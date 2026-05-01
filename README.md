# AI Agent Hub

A VS Code extension that acts as a centralized control plane for managing
AI behavior content (skills, rules, hooks) and syncing it to any
configured AI agent target (Kiro, Cursor, GitHub Copilot, Amazon Q, etc.).

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
   [Releases](https://github.disney.com/WDPR-Lodging/ai-agent-hub/releases)
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
git clone https://github.disney.com/WDPR-Lodging/ai-agent-hub.git
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

If you have the GitHub CLI (`gh`) configured for `github.disney.com`:

```bash
gh release download --repo WDPR-Lodging/ai-agent-hub \
  --pattern "*.vsix" --dir .
code --install-extension ai-agent-hub.vsix
```

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

## Settings

| Setting                                    | Default | Description                        |
| ------------------------------------------ | ------- | ---------------------------------- |
| `aiAgentHub.autoSync.confirmBeforeSync`    | `true`  | Prompt before auto-syncing content |

## Content Structure

Hub content lives in the `hub-content/` directory:

```text
hub-content/
  skills/    — Skill markdown files
  rules/     — Rule markdown files
  hooks/     — Hook markdown files
  tools/     — (reserved for future use)
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

Internal use only — The Walt Disney Company.
