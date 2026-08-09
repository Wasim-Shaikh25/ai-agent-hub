-- Content registry: publish status + version history / approvals.

-- Live publish state of a content item. 'approved' items are the ones agents
-- receive; 'pending' items are staged awaiting review.
ALTER TABLE content_item ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved';

CREATE TABLE IF NOT EXISTS content_version (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  content_item_id uuid NOT NULL REFERENCES content_item(id) ON DELETE CASCADE,
  version         integer NOT NULL,
  name            text NOT NULL,
  description     text NOT NULL DEFAULT '',
  body            text NOT NULL DEFAULT '',
  trigger         text,
  status          text NOT NULL DEFAULT 'pending',   -- pending|approved|rejected
  actor_id        uuid REFERENCES app_user(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS content_version_item_idx ON content_version (content_item_id, version DESC);
