-- Connected-agent detection. Populated server-side from the MCP `initialize`
-- handshake (clientInfo) and from gateway requests (x-hub-agent + model), so the
-- console can show which agents are actually talking to the Hub and what model
-- each last used. No local machine scanning — this is what connects, not what's
-- installed.
CREATE TABLE IF NOT EXISTS agent_connection (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES app_user(id) ON DELETE SET NULL,
  agent      text NOT NULL,              -- normalized display name
  raw_name   text NOT NULL DEFAULT '',   -- as reported by the client
  version    text NOT NULL DEFAULT '',
  source     text NOT NULL,             -- mcp | gateway
  last_model text,                       -- last model seen (gateway path)
  project    text,
  seen_count integer NOT NULL DEFAULT 1,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, agent, source)
);
CREATE INDEX IF NOT EXISTS agent_connection_org_idx ON agent_connection (org_id, last_seen DESC);
