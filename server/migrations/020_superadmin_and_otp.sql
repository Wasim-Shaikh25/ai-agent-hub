-- Superadmin contact fields, org admin email, and OTP table.

ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS mobile text,
  ADD COLUMN IF NOT EXISTS password_hash text;

ALTER TABLE org
  ADD COLUMN IF NOT EXISTS admin_email text UNIQUE;

CREATE TABLE IF NOT EXISTS otp_code (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL,
  purpose    text NOT NULL,
  code       text NOT NULL,
  used       boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS otp_code_email_purpose_idx ON otp_code (email, purpose, created_at DESC);
