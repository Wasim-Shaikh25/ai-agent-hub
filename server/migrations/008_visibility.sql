-- Memory visibility scopes: org (everyone), project (that repo), private (author).

ALTER TABLE memory ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'project';
ALTER TABLE memory ADD COLUMN IF NOT EXISTS author_id uuid;
CREATE INDEX IF NOT EXISTS memory_visibility_idx ON memory (org_id, visibility);
