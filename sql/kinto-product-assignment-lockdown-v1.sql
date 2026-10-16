-- Final stage: only after session SQL, client deployment and isolated tests.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.kinto_vendor_product_write_session_v1(text,text,uuid,jsonb,jsonb)') IS NULL
 OR to_regprocedure('public.kinto_save_branch_orders_session_v1(text,text,text,jsonb,jsonb)') IS NULL THEN RAISE EXCEPTION 'INSTALL_PRODUCT_ASSIGNMENT_SESSIONS_FIRST'; END IF;
 IF (SELECT prosecdef FROM pg_proc WHERE oid='private.kinto_order_assignment_api_guard_v1()'::regprocedure) THEN RAISE EXCEPTION 'ASSIGNMENT_GUARD_MUST_BE_INVOKER'; END IF;
END $$;
REVOKE INSERT,UPDATE,DELETE ON public.local_products FROM PUBLIC,anon,authenticated;
DO $$ DECLARE cols text; role_name text;
BEGIN
 SELECT string_agg(quote_ident(attname),',') INTO cols FROM pg_attribute WHERE attrelid='public.local_products'::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE format('REVOKE INSERT (%s),UPDATE (%s) ON public.local_products FROM PUBLIC,anon,authenticated',cols,cols);
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF has_table_privilege(role_name,'public.local_products','INSERT') OR has_table_privilege(role_name,'public.local_products','UPDATE')
  OR has_table_privilege(role_name,'public.local_products','DELETE') OR has_any_column_privilege(role_name,'public.local_products','INSERT')
  OR has_any_column_privilege(role_name,'public.local_products','UPDATE') THEN RAISE EXCEPTION 'PRODUCT_WRITE_LOCKDOWN_FAILED'; END IF;
 END LOOP;
END $$;
DROP TRIGGER IF EXISTS trg_kinto_order_assignment_api_guard_v1 ON public.orders;
CREATE TRIGGER trg_kinto_order_assignment_api_guard_v1 BEFORE UPDATE OF branch_id,courier_id,delivery_agent_id,branch_name,courier_name ON public.orders
FOR EACH ROW EXECUTE FUNCTION private.kinto_order_assignment_api_guard_v1();
COMMIT;
