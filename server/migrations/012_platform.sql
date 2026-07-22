-- Platform super-admin, org suspension, and training-data capture.

ALTER TABLE app_user ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;
ALTER TABLE org ADD COLUMN IF NOT EXISTS suspended boolean NOT NULL DEFAULT false;

-- User feedback labels + copilot exchanges (redacted). Not gateway harvesting.
CREATE TABLE IF NOT EXISTS training_sample (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid REFERENCES org(id) ON DELETE SET NULL,
  kind       text NOT NULL,              -- feedback | assistant
  input      text NOT NULL DEFAULT '',
  output     text NOT NULL DEFAULT '',
  meta       jsonb NOT NULL DEFAULT '{}',
  rating     integer,                    -- feedback: 1 (up) / -1 (down)
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS training_sample_idx ON training_sample (kind, created_at DESC);
