-- AI Agent Hub — initial schema
-- Requires the pgvector extension (bundled in the pgvector/pgvector image).
-- NOTE: embedding columns are vector(1536) to match EMBEDDING_DIM default.
-- If you change EMBEDDING_DIM, update these dimensions to match.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tenancy & identity
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS org (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  slug       text UNIQUE NOT NULL,
  plan       text NOT NULL DEFAULT 'free',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_user (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text UNIQUE NOT NULL,
  name       text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS membership (
  org_id  uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  role    text NOT NULL DEFAULT 'member',
  PRIMARY KEY (org_id, user_id)
);

CREATE TABLE IF NOT EXISTS api_key (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  name         text NOT NULL DEFAULT 'default',
  hash         text UNIQUE NOT NULL,          -- sha256 of the raw key
  prefix       text NOT NULL DEFAULT '',
  last_used_at timestamptz,
  revoked      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Projects, sessions, turns
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  name       text NOT NULL,
  repo_path  text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

CREATE TABLE IF NOT EXISTS session (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  key        text NOT NULL,           -- agent-supplied stable id (e.g. branch)
  title      text NOT NULL DEFAULT '',
  summary    text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, project_id, key)
);

CREATE TABLE IF NOT EXISTS turn (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  role       text NOT NULL,           -- user|assistant|tool|system
  agent      text NOT NULL DEFAULT '',
  content    text NOT NULL,
  tokens     integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS turn_session_idx ON turn (session_id, created_at);

-- ---------------------------------------------------------------------------
-- Memory (semantic)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memory (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  project_id uuid REFERENCES project(id) ON DELETE CASCADE,   -- null = org-global
  kind       text NOT NULL DEFAULT 'fact',                    -- fact|decision|preference
  content    text NOT NULL,
  embedding  vector(1536),
  source     text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS memory_embedding_idx
  ON memory USING hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- Documents + chunks (RAG)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  uri        text NOT NULL,
  title      text NOT NULL DEFAULT '',
  hash       text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chunk (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  ord         integer NOT NULL DEFAULT 0,
  content     text NOT NULL,
  embedding   vector(1536)
);
CREATE INDEX IF NOT EXISTS chunk_embedding_idx
  ON chunk USING hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- Content registry (skills/rules/hooks/workflows/personas)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS content_item (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  type        text NOT NULL,          -- skill|rule|hook|workflow|persona
  slug        text NOT NULL,
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  body        text NOT NULL DEFAULT '',
  trigger     text,                   -- hooks only: before|after|always
  enabled     boolean NOT NULL DEFAULT true,
  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, type, slug)
);

-- ---------------------------------------------------------------------------
-- Policy & usage
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS policy (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id  uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  kind    text NOT NULL,              -- routing|model|budget|content
  spec    jsonb NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS usage_event (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES app_user(id) ON DELETE SET NULL,
  kind       text NOT NULL,           -- mcp_call|tokens|rag_query
  qty        numeric NOT NULL DEFAULT 0,
  meta       jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usage_event_org_idx ON usage_event (org_id, created_at);
