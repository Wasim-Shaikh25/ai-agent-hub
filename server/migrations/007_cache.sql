-- Semantic response cache: return a stored completion when a new prompt is
-- close (by embedding similarity) to a previous one.

CREATE TABLE IF NOT EXISTS cache_entry (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  model      text NOT NULL,
  prompt     text NOT NULL,
  embedding  vector(1536),
  response   jsonb NOT NULL,
  hits       integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cache_entry_embedding_idx ON cache_entry USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS cache_entry_org_model_idx ON cache_entry (org_id, model);
