-- Governance: per-key role override + audit log.

-- Optional role override carried by an API key (else the membership role wins).
ALTER TABLE api_key ADD COLUMN IF NOT EXISTS role text;

CREATE TABLE IF NOT EXISTS audit_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES app_user(id) ON DELETE SET NULL,
  action     text NOT NULL,             -- e.g. content.create, policy.delete
  target     text NOT NULL DEFAULT '',  -- affected entity id/name
  meta       jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_org_idx ON audit_log (org_id, created_at DESC);
