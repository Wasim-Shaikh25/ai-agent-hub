-- OAuth identities for Google, Apple, and future providers.
CREATE TABLE IF NOT EXISTS oauth_identity (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  provider      text NOT NULL,                       -- google | apple
  provider_user_id text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS oauth_identity_user_idx ON oauth_identity (user_id);
