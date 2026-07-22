-- Fix the RLS escape for the empty-string GUC.
--
-- After a request runs `SET LOCAL app.current_org = <org>` (see setOrgContext /
-- db pool) and the transaction ends, the custom GUC reverts to '' (empty
-- string), NOT to unset. When that pooled connection is later reused WITHOUT an
-- org context (auth bootstrap, background jobs, platform-admin cross-org reads),
-- the old policy hit `''::uuid` and errored, and its `IS NULL` escape didn't
-- catch '' either. NULLIF(..., '') collapses both '' and unset to NULL so those
-- queries stay permissive, while a real org value still enforces isolation.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'project','session','memory','document','content_item','content_version',
    'policy','usage_event','api_key','membership','audit_log','mcp_server'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY org_isolation ON %I '
      || 'USING (org_id = NULLIF(current_setting(''app.current_org'', true), '''')::uuid '
      || '      OR NULLIF(current_setting(''app.current_org'', true), '''') IS NULL) '
      || 'WITH CHECK (org_id = NULLIF(current_setting(''app.current_org'', true), '''')::uuid '
      || '      OR NULLIF(current_setting(''app.current_org'', true), '''') IS NULL)', t);
  END LOOP;
END $$;
