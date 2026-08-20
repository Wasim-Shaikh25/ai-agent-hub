-- Email/password auth for the customer web app (SSO remains as an alternative login method).
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS password_hash text;
