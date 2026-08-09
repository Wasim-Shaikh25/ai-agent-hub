-- User-facing support tickets. Authenticated users can raise tickets from
-- the Help page; operators triage them from the platform admin console.
CREATE TABLE IF NOT EXISTS support_ticket (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid REFERENCES org(id) ON DELETE SET NULL,
  user_id     uuid REFERENCES app_user(id) ON DELETE SET NULL,
  category    text NOT NULL DEFAULT 'General',
  subject     text NOT NULL,
  body        text NOT NULL,
  status      text NOT NULL DEFAULT 'open',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_ticket_org_idx ON support_ticket (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_ticket_status_idx ON support_ticket (status, created_at DESC);

-- Optional operator comments on a ticket.
CREATE TABLE IF NOT EXISTS support_ticket_comment (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  support_ticket_id uuid REFERENCES support_ticket(id) ON DELETE CASCADE,
  author_user_id   uuid REFERENCES app_user(id) ON DELETE SET NULL,
  body             text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
