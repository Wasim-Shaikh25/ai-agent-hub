-- Knowledge map: a navigable index over indexed docs/specs so an agent can
-- orient (title → summary → sections → keywords) before drilling into chunks.

ALTER TABLE document ADD COLUMN IF NOT EXISTS summary text NOT NULL DEFAULT '';
ALTER TABLE document ADD COLUMN IF NOT EXISTS kind    text NOT NULL DEFAULT 'doc';  -- spec | code | doc
