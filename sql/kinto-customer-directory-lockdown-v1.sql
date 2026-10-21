-- Final stage after additive SQL, frontend deployment and isolated authorization tests.
-- Existing session RPCs keep owner access. No row mutations or policy replacements.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.kinto_customer_directory_session_v1(text,text,jsonb,text,text,boolean,integer,integer)') IS NULL THEN
  RAISE EXCEPTION 'INSTALL_CUSTOMER_DIRECTORY_RPC_FIRST';
 END IF;
END $$;
REVOKE ALL ON TABLE public.customers FROM PUBLIC,anon,authenticated;
DO $$ DECLARE columns text; api_role text;
BEGIN
 SELECT string_agg(quote_ident(attname),',') INTO columns FROM pg_attribute
 WHERE attrelid='public.customers'::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE format('REVOKE ALL PRIVILEGES (%1$s) ON public.customers FROM PUBLIC,anon,authenticated',columns);
 FOREACH api_role IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF has_table_privilege(api_role,'public.customers','SELECT') OR has_table_privilege(api_role,'public.customers','INSERT')
  OR has_table_privilege(api_role,'public.customers','UPDATE') OR has_table_privilege(api_role,'public.customers','DELETE')
  OR has_table_privilege(api_role,'public.customers','TRUNCATE') OR has_table_privilege(api_role,'public.customers','REFERENCES') OR has_table_privilege(api_role,'public.customers','TRIGGER')
  OR has_any_column_privilege(api_role,'public.customers','UPDATE') OR has_any_column_privilege(api_role,'public.customers','REFERENCES')
  OR has_any_column_privilege(api_role,'public.customers','SELECT') OR has_any_column_privilege(api_role,'public.customers','INSERT') THEN
   RAISE EXCEPTION 'CUSTOMER_DIRECTORY_LOCKDOWN_FAILED: %',api_role;
  END IF;
 END LOOP;
END $$;
COMMIT;
