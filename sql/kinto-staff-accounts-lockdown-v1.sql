-- Separate final stage ONLY after additive SQL, UI deployment and multi-role smoke tests.
-- Customers, orders and all existing session/account RPCs are outside this revocation.
BEGIN;
REVOKE ALL ON TABLE public.employees,public.branches,public.couriers FROM PUBLIC,anon,authenticated;
DO $$ DECLARE t text; r text; p text;
BEGIN
 FOREACH t IN ARRAY ARRAY['employees','branches','couriers'] LOOP
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
   FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
    IF has_table_privilege(r,format('public.%I',t),p) THEN RAISE EXCEPTION 'STAFF_LOCKDOWN_FAILED: %.% %',r,t,p; END IF;
   END LOOP;
   IF EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=format('public.%I',t)::regclass AND a.attnum>0 AND NOT a.attisdropped AND (has_column_privilege(r,a.attrelid,a.attnum,'SELECT') OR has_column_privilege(r,a.attrelid,a.attnum,'UPDATE') OR has_column_privilege(r,a.attrelid,a.attnum,'INSERT'))) THEN RAISE EXCEPTION 'STAFF_COLUMN_GRANTS_REMAIN: %.%',r,t; END IF;
  END LOOP;
 END LOOP;
END $$;
COMMIT;
