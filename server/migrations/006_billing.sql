-- Billing: link an org to a Stripe customer + track subscription state.

ALTER TABLE org ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE org ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'none';
