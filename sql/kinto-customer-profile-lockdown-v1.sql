-- Final stage only after additive SQL, deployed dashboard, and isolated tests.
-- Blocks direct UPDATE/DELETE, including column grants. SELECT/INSERT are separate work.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.customer_update_profile_session_v1(text,jsonb)') IS NULL THEN
  RAISE EXCEPTION 'INSTALL_CUSTOMER_PROFILE_SESSION_RPC_FIRST';
 END IF;
END $$;
REVOKE UPDATE,DELETE ON public.customers FROM PUBLIC,anon,authenticated;
DO $$ DECLARE columns text; api_role text;
BEGIN
 SELECT string_agg(quote_ident(attname),',') INTO columns FROM pg_attribute
 WHERE attrelid='public.customers'::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE format('REVOKE UPDATE (%s) ON public.customers FROM PUBLIC,anon,authenticated',columns);
 FOREACH api_role IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF has_table_privilege(api_role,'public.customers','UPDATE') OR has_table_privilege(api_role,'public.customers','DELETE')
   OR has_any_column_privilege(api_role,'public.customers','UPDATE') THEN
   RAISE EXCEPTION 'CUSTOMER_PROFILE_LOCKDOWN_FAILED: %',api_role;
  END IF;
 END LOOP;
END $$;
COMMIT;
