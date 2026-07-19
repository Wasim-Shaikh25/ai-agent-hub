-- Downstream MCP servers the Hub aggregates and re-exposes through its own
-- single MCP endpoint (namespaced <server>__<tool>).

CREATE TABLE IF NOT EXISTS mcp_server (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  name       text NOT NULL,
  transport  text NOT NULL DEFAULT 'http',   -- 'http' | 'stdio'
  url        text NOT NULL DEFAULT '',        -- http transport
  command    text NOT NULL DEFAULT '',        -- stdio transport
  args       jsonb NOT NULL DEFAULT '[]',
  env        jsonb NOT NULL DEFAULT '{}',
  enabled    boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);
