-- Operational event log for issue analysis. Captures noteworthy runtime events
-- (errors, provider failures, budget/limit hits, redaction blocks, slow calls)
-- so operators can spot and diagnose problems across every workspace.
CREATE TABLE IF NOT EXISTS system_event (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid REFERENCES org(id) ON DELETE SET NULL,
  level      text NOT NULL,              -- error | warn | info
  source     text NOT NULL,             -- gateway | auth | mcp | billing | ...
  code       text NOT NULL,             -- provider_error | budget_exceeded | ...
  message    text NOT NULL DEFAULT '',
  meta       jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS system_event_recent_idx ON system_event (created_at DESC);
CREATE INDEX IF NOT EXISTS system_event_code_idx ON system_event (code, created_at DESC);
CREATE INDEX IF NOT EXISTS system_event_org_idx ON system_event (org_id, created_at DESC);
