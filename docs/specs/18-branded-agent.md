# Phase 2 — Branded Coding Agent (fork plan)

> Status: **planned / integration ready** · Depends on: `17-agents-models-console.md`.
> Decision: **fork Cline.** This doc is the build plan; the fork lives in its own
> repo (not vendored here), while the Hub-side integration ships now.

## 1. Goal

Ship *our own branded* coding agent — a UI where the **user** picks agent
behaviour + model and it just runs, all routed through the Hub — without writing
an agent from scratch and without maintaining a heavy multi-IDE core.

## 2. Why Cline (fastest UI, easiest to rebrand)

Evaluated against the "fastest UI, easiest to manipulate, user-oriented" bar:

| Candidate | UI | Rebrand effort | Custom endpoint | Verdict |
|---|---|---|---|---|
| **Cline** | React webview, single **VS Code** target | Low — name/icon/color in one extension | Native **"OpenAI Compatible"** provider | ✅ **pick** |
| Continue | React GUI, **VS Code + JetBrains** core | Higher — two IDEs, bigger core | Custom provider | heavier |
| Aider | terminal (no GUI) | n/a | any OpenAI base | already wired via `aihub run` |

Cline is Apache-2.0, so forking + rebranding is allowed (keep the `LICENSE` /
`NOTICE`). Its provider settings already expose base URL + key + model, so
pointing it at the Hub is first-class, and its webview is one React app — the
smallest surface to restyle.

## 3. Integration that ships now (Hub side)

So Cline (and the future fork) works against the Hub immediately:

- **`aihub connect cline`** writes the MCP config (context tools) and prints the
  gateway settings.
- Gateway provider preset: **OpenAI Compatible** → base URL `<hub>/v1`, API key =
  the user's Hub key, model list from `GET /v1/models`.
- The user's model choice (spec 17 FR4) and the Hub's routing/fallback/metering
  all apply — the branded agent inherits everything for free.

## 4. Fork & rebrand steps (separate repo)

1. `git clone` Cline → `your-agent`; keep `LICENSE` + `NOTICE` (Apache-2.0).
2. **Rebrand:** extension `name`/`displayName`/`publisher`/icons in
   `package.json`; product name + logo/colors in the `webview-ui` React app.
3. **Default provider = the Hub:** pre-fill the "OpenAI Compatible" provider with
   base URL `<hub>/v1` and fetch models from `GET /v1/models`, so first-run is
   zero-config against your service.
4. **Auth:** accept the user's Hub API key (or an SSO-issued token) as the key.
5. **Context:** register the Hub MCP server by default so the agent gets
   sessions/memory/RAG out of the box (same config `aihub connect cline` writes).
6. **Identify itself:** send `clientInfo.name = "<YourBrand>"` on the MCP
   handshake and `x-hub-agent` on gateway calls, so it shows in the Agents tab.
7. Build + publish the `.vsix` (your Marketplace publisher, or private dist).

## 5. Non-goals / honesty

- We do **not** vendor Cline's source into this monorepo — it's a large external
  codebase with its own release cadence; the fork is its own repo.
- Fork cost: periodic upstream merges. Revisit "build vs. fork vs. stay
  integration-only" after Phase 1 usage data.

## 6. Acceptance (Phase 2, when the fork is built)

1. First run points at the Hub with no manual config; models come from `/v1/models`.
2. The branded agent appears in `/admin` → Agents as `<YourBrand>` (mcp+gateway).
3. The user's model choice from their Account page governs its calls.
4. No upstream Cline branding remains in the shipped `.vsix`.
