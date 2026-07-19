-- Row-Level Security: defense-in-depth tenant isolation at the database layer,
-- complementing the app's org_id-scoped queries.
--
-- The policy restricts rows to the org set in the `app.current_org` session GUC.
-- When the GUC is unset it allows all rows, so existing app-layer-scoped queries
-- keep working unchanged; when a request sets the GUC (see withOrg() in
-- db/pool.ts) the database itself enforces isolation. FORCE makes the policy
-- apply even to the table owner the app connects as.
--
-- Hardening note: to make isolation mandatory, drop the "IS NULL" escape and
-- run the app under a dedicated non-owner role.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'project','session','memory','document','content_item','content_version',
    'policy','usage_event','api_key','membership','audit_log','mcp_server'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY org_isolation ON %I '
      || 'USING (org_id = current_setting(''app.current_org'', true)::uuid '
      || '      OR current_setting(''app.current_org'', true) IS NULL) '
      || 'WITH CHECK (org_id = current_setting(''app.current_org'', true)::uuid '
      || '      OR current_setting(''app.current_org'', true) IS NULL)', t);
  END LOOP;
END $$;
