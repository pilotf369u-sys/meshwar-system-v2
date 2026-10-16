-- Narrow emergency rollback of this stage only; no business rows changed.
BEGIN;
DROP POLICY IF EXISTS kinto_order_session_select_v1 ON public.orders;
DROP POLICY IF EXISTS kinto_order_session_update_v1 ON public.orders;
DROP POLICY IF EXISTS kinto_order_session_insert_v1 ON public.orders;
DROP TRIGGER IF EXISTS trg_kinto_order_session_write_guard_v1 ON public.orders;
GRANT SELECT ON public.local_products TO anon,authenticated;
DO $$ DECLARE f regprocedure; BEGIN
 FOR f IN SELECT p.oid::regprocedure FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN
 ('checkout_independent_vendor_orders','checkout_independent_vendor_orders_v101','checkout_independent_vendor_orders_v161','customer_portal_data','customer_portal_data_v2','vendor_close_financial_period') LOOP
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon,authenticated',f); END LOOP; END $$;
COMMIT;
