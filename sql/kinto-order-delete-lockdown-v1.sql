-- Browser order cancellation uses UPDATE/session RPCs; physical deletion is unused.
-- No rows, UPDATE/SELECT/INSERT grants, RLS policies or existing triggers change.
BEGIN;
REVOKE DELETE ON TABLE public.orders FROM PUBLIC,anon,authenticated;
DO $$ DECLARE api_role text;
BEGIN
 FOREACH api_role IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF has_table_privilege(api_role,'public.orders','DELETE') THEN
   RAISE EXCEPTION 'ORDER_DELETE_LOCKDOWN_FAILED: %',api_role;
  END IF;
 END LOOP;
END $$;
COMMIT;
