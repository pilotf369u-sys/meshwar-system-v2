-- Only after additive SQL, all four staff save handlers deployed, isolated tests green.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.kinto_save_staff_order_session_v1(text,text,uuid,text,numeric,text,jsonb)') IS NULL THEN
  RAISE EXCEPTION 'INSTALL_STAFF_ORDER_SAVE_FIRST'; END IF;
 IF (SELECT prosecdef FROM pg_proc WHERE oid='private.kinto_order_price_api_guard_v1()'::regprocedure) THEN
  RAISE EXCEPTION 'PRICE_GUARD_MUST_BE_INVOKER'; END IF;
END $$;
DROP TRIGGER IF EXISTS trg_kinto_order_price_api_guard_v1 ON public.orders;
CREATE TRIGGER trg_kinto_order_price_api_guard_v1 BEFORE UPDATE OF total_price,currency ON public.orders
FOR EACH ROW EXECUTE FUNCTION private.kinto_order_price_api_guard_v1();
COMMIT;
