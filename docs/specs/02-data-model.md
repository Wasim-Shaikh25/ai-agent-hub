# Data Model Spec

> Status: **draft v1** · Store: Postgres 16 + pgvector

## 1. Entities

```
Org ──< Membership >── User
 │
 ├──< Project (repo)
 │      ├──< Session ──< Turn
 │      ├──< Memory      (vector)
 │      └──< Document ──< Chunk (vector)
 │
 ├──< ContentItem (skill|rule|hook|workflow|persona, versioned)
 ├──< Policy       (routing / model / budget)
 └──< UsageEvent   (metering)
```

## 2. Core tables (see `server/migrations/001_init.sql` for the DDL)

### org
`id`, `name`, `slug`, `plan` (`free|team|enterprise`), `suspended` (bool — a
suspended org is blocked at auth with `403 org_suspended`), `created_at`.

### app_user
`id`, `email`, `name`, `password_hash` (nullable; scrypt), `is_platform_admin`
(bool — grants the vendor-only `/superadmin` console), `created_at`.

### membership
`org_id`, `user_id`, `role` (`owner|admin|member|viewer`). PK `(org_id,user_id)`.

### api_key
`id`, `org_id`, `user_id`, `name`, `hash` (sha256 of key), `prefix`,
`last_used_at`, `revoked`, `created_at`. Auth resolves a bearer key → org+user.

### project
`id`, `org_id`, `name`, `repo_path`, `created_at`. A "project" ≈ a repo.

### session
`id`, `org_id`, `project_id`, `key` (agent-supplied stable id, e.g. branch),
`title`, `summary` (rolling compaction), `created_at`, `updated_at`.
Unique `(org_id, project_id, key)` → this is what makes a session **shared
across agents**: any agent using the same key reads/writes the same session.

### turn
`id`, `session_id`, `role` (`user|assistant|tool|system`), `agent`
(which client wrote it, e.g. `cursor`), `content`, `tokens`, `created_at`.
Append-only.

### memory
`id`, `org_id`, `project_id` (nullable = org-global), `kind`
(`fact|decision|preference`), `content`, `embedding vector(1536)`, `source`,
`created_at`. Semantic search via `embedding <=> query`.

### document / chunk
`document`: `id`, `org_id`, `project_id`, `uri`, `title`, `hash`, `created_at`.
`chunk`: `id`, `document_id`, `ord`, `content`, `embedding vector(1536)`.
Powers RAG over repo/docs.

### content_item
`id`, `org_id`, `type` (`skill|rule|hook|workflow|persona`), `slug`, `name`,
`description`, `body`, `enabled`, `version`, `trigger` (hooks only),
`updated_at`. Superset of the extension's front-matter model.

### policy
`id`, `org_id`, `kind` (`routing|model|budget|content`), `spec jsonb`,
`enabled`. e.g. routing: `{"task":"refactor","model":"claude-opus-4-8"}`.

### usage_event
`id`, `org_id`, `user_id`, `kind` (`mcp_call|tokens|rag_query`), `qty`,
`meta jsonb`, `created_at`. Rolls up into billing.

### system_event  (migration 013)
`id`, `org_id` (nullable), `level` (`error|warn|info`), `source`
(`gateway|auth|…`), `code` (`provider_error|budget_exceeded|…`), `message`
(redacted), `meta jsonb`, `created_at`. The operational **issue log** — powers
the `/superadmin` Issues tab and the copilot's issue awareness. Indexed on
`created_at`, `(code, created_at)`, and `(org_id, created_at)`. See
`16-platform-admin.md`.

### training_sample  (migration 012)
`id`, `org_id` (nullable), `kind` (`feedback|assistant`), `input`, `output`
(both redacted), `meta jsonb`, `rating` (`1|-1`, feedback only), `created_at`.
Holds user 👍/👎 labels and copilot exchanges — **not** harvested gateway
prompt/response pairs.

### agent_connection  (migration 014)
`id`, `org_id`, `user_id` (nullable), `agent` (normalized display name),
`raw_name`, `version`, `source` (`mcp|gateway`), `last_model`, `project`,
`seen_count`, `first_seen`, `last_seen`. Server-side **connected-agent
detection** from the MCP `initialize` handshake + gateway traffic. Unique
`(org_id, agent, source)` for upsert. See `17-agents-models-console.md`.

## 3. Indexing

- `session (org_id, project_id, key)` unique.
- `turn (session_id, created_at)`.
- ivfflat / hnsw index on `memory.embedding` and `chunk.embedding`
  (`vector_cosine_ops`).
- `content_item (org_id, type, slug)` unique.

## 4. Embedding dimension

Configurable via `EMBEDDING_DIM` (default **1536**, matches
`text-embedding-3-small`). The local offline fallback produces vectors of the
same dimension so schemas don't change between dev and prod.

## 5. Multi-tenancy

Every row carries `org_id`. Phase 1 enforces scoping in the query layer. Phase 3
adds Postgres Row-Level Security (RLS) or schema-per-org for hard isolation.
