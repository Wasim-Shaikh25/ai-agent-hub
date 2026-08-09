# Context Scoping & Auto-Binding Spec

> Status: **draft v1**. Answers: with N projects and many chat sessions across
> Cursor / Windsurf / Claude Code, which context is shared with which?

## 1. Addressing

Every context item is addressed by `(project, key)`:

- **project** = the repo you're working in (`acme-web` vs `acme-api`).
- **key** = a conversation thread identifier (a chat, or a branch).

## 2. What is scoped where

| Context | Scoped to | Shared across |
|---|---|---|
| Memory (`org` visibility) | org | everything, every project + user |
| Memory (`project` visibility, default) | project | every session/agent in that repo |
| Memory (`private` visibility) | author | only the author |
| RAG / knowledge | project | every session/agent in that repo |
| Skills / rules | org | everything |
| Session history (turns) | key | only sessions using the same key |

So **memory + RAG are a shared brain per repo**; **session threads are per key**.

## 3. Auto-binding (so agents don't guess)

`aihub connect <agent>` detects, from git:
- **project** = repo name (`git remote origin` basename, else folder name)
- **session key** = current branch (`git rev-parse --abbrev-ref HEAD`)

and stamps them into the agent's MCP config as headers:

```json
"headers": {
  "Authorization": "Bearer <key>",
  "X-Hub-Project": "acme-web",
  "X-Hub-Session": "feature-auth"
}
```

The server reads `X-Hub-Project` / `X-Hub-Session` and uses them as the default
`project` / `key` for any MCP tool call that omits them. Tool args still override
when a caller wants a specific project/thread.

## 4. Worked example

2 repos; in `acme-web`: 3 Cursor chats + 2 Windsurf chats.

- All 5 chats in `acme-web` **auto-share** memory + RAG (same project). A
  decision saved in Cursor is available in Windsurf immediately.
- `acme-api` is a **separate** pool — no leakage between the two repos.
- Session threads follow the **key**: same branch → a Cursor chat and a Windsurf
  chat continue the *same* thread; different branch/chat → separate threads.
- A developer's exploratory note can be `private` (only them); a team decision
  `project`; a company standard `org`.

## 5. Verified

- MCP `memory_write` with only `X-Hub-Project: acme-web` (no project arg) stores
  under `acme-web`; a search bound to `acme-web` finds it, `acme-api` does not.
- Org memory is visible from any project; private memory is visible only to its
  author (a second SSO user could not see it).
- `aihub connect` auto-detected `project` = repo and `session` = branch and wrote
  the correct headers.
