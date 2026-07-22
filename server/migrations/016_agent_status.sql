-- Agent liveness status. mcp/gateway rows are 'connected' (they called the Hub);
-- local-scan rows (from `aihub detect`) are 'running' or 'installed'. The console
-- groups by agent and shows the strongest status, with a Connect nudge for
-- agents that are present but not yet wired to the Hub.
ALTER TABLE agent_connection ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'connected';
