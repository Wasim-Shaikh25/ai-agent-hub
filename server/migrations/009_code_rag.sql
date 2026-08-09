-- Code-aware hybrid RAG: sparse (BM25-style) index alongside dense vectors,
-- plus code metadata so retrieval can cite path:symbol.

ALTER TABLE chunk ADD COLUMN IF NOT EXISTS path     text NOT NULL DEFAULT '';
ALTER TABLE chunk ADD COLUMN IF NOT EXISTS symbol   text NOT NULL DEFAULT '';
ALTER TABLE chunk ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT '';

-- 'simple' config = no stemming, so identifiers like getUserById stay intact.
ALTER TABLE chunk ADD COLUMN IF NOT EXISTS ts tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED;

CREATE INDEX IF NOT EXISTS chunk_ts_idx ON chunk USING gin (ts);
