-- Activate only after all clients use session headers and vendor read RPCs.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.kinto_vendor_products_read_session_v1(text)') IS NULL OR to_regprocedure('public.kinto_vendor_orders_read_session_v1(text)') IS NULL
 OR to_regprocedure('private.kinto_order_session_write_guard_v1()') IS NULL THEN RAISE EXCEPTION 'INSTALL_ORDER_PRIVACY_SESSIONS_FIRST'; END IF;
 IF (SELECT prosecdef FROM pg_proc WHERE oid='private.kinto_order_session_write_guard_v1()'::regprocedure) THEN RAISE EXCEPTION 'ORDER_GUARD_MUST_BE_INVOKER'; END IF;
END $$;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
-- Restrictive policies intersect ALL existing permissive policies; old broad rules cannot bypass them.
DROP POLICY IF EXISTS kinto_order_session_select_v1 ON public.orders;
CREATE POLICY kinto_order_session_select_v1 ON public.orders AS RESTRICTIVE FOR SELECT TO anon,authenticated
 USING(private.kinto_order_visible_v1(to_jsonb(orders),(SELECT private.kinto_request_actor_v1())));
DROP POLICY IF EXISTS kinto_order_session_update_v1 ON public.orders;
CREATE POLICY kinto_order_session_update_v1 ON public.orders AS RESTRICTIVE FOR UPDATE TO anon,authenticated
 USING(private.kinto_order_visible_v1(to_jsonb(orders),(SELECT private.kinto_request_actor_v1())))
 WITH CHECK(private.kinto_order_visible_v1(to_jsonb(orders),(SELECT private.kinto_request_actor_v1())));
DROP POLICY IF EXISTS kinto_order_session_insert_v1 ON public.orders;
CREATE POLICY kinto_order_session_insert_v1 ON public.orders AS RESTRICTIVE FOR INSERT TO anon,authenticated
 WITH CHECK(customer_id=(SELECT private.kinto_request_actor_v1()->>'id') AND (SELECT private.kinto_request_actor_v1()->>'role')='customer');
DROP TRIGGER IF EXISTS trg_kinto_order_session_write_guard_v1 ON public.orders;
CREATE TRIGGER trg_kinto_order_session_write_guard_v1 BEFORE INSERT OR UPDATE ON public.orders
 FOR EACH ROW EXECUTE FUNCTION private.kinto_order_session_write_guard_v1();
-- Remove the direct legacy checkout entry points; the new session wrapper calls the unchanged V161 as owner.
DO $$ DECLARE f regprocedure;
BEGIN
 FOR f IN SELECT p.oid::regprocedure FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN
 ('checkout_independent_vendor_orders','checkout_independent_vendor_orders_v101','checkout_independent_vendor_orders_v161','customer_portal_data','customer_portal_data_v2','vendor_close_financial_period') LOOP
  EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC,anon,authenticated',f);
 END LOOP;
END $$;
-- Direct product writes remain locked. Public product columns keep SELECT; cost is vendor-session-only.
REVOKE SELECT ON public.local_products FROM PUBLIC,anon,authenticated;
DO $$ DECLARE cols text;
BEGIN
 SELECT string_agg(quote_ident(attname),',') INTO cols FROM pg_attribute WHERE attrelid='public.local_products'::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE format('REVOKE SELECT (%s) ON public.local_products FROM PUBLIC,anon,authenticated',cols);
 SELECT string_agg(quote_ident(attname),',') INTO cols FROM pg_attribute WHERE attrelid='public.local_products'::regclass AND attnum>0 AND NOT attisdropped AND attname<>'cost_price';
 EXECUTE format('GRANT SELECT (%s) ON public.local_products TO anon,authenticated',cols);
 IF has_column_privilege('anon','public.local_products','cost_price','SELECT') OR has_column_privilege('authenticated','public.local_products','cost_price','SELECT') THEN RAISE EXCEPTION 'PRODUCT_COST_LOCKDOWN_FAILED'; END IF;
END $$;
COMMIT;
