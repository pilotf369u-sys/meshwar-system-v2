-- Run input authorization before server-side loyalty/stock mutations of NEW.
-- No grants, business rows, session rules or financial algorithms are changed.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('private.kinto_order_session_write_guard_v1()') IS NULL
 OR (SELECT prosecdef FROM pg_proc WHERE oid='private.kinto_order_session_write_guard_v1()'::regprocedure) THEN
 RAISE EXCEPTION 'ORDER_INPUT_GUARD_MISSING_OR_NOT_INVOKER';END IF;
 IF EXISTS(SELECT FROM pg_trigger WHERE tgrelid='public.orders'::regclass AND tgname='trg_kinto_order_session_write_guard_v1' AND NOT tgisinternal) THEN
  IF EXISTS(SELECT FROM pg_trigger WHERE tgrelid='public.orders'::regclass AND tgname='trg_00_kinto_order_session_write_guard_v1' AND NOT tgisinternal) THEN
   DROP TRIGGER trg_kinto_order_session_write_guard_v1 ON public.orders;
  ELSE
   ALTER TRIGGER trg_kinto_order_session_write_guard_v1 ON public.orders RENAME TO trg_00_kinto_order_session_write_guard_v1;
  END IF;
 END IF;
 IF NOT EXISTS(SELECT FROM pg_trigger WHERE tgrelid='public.orders'::regclass AND tgname='trg_00_kinto_order_session_write_guard_v1'
 AND tgfoid='private.kinto_order_session_write_guard_v1()'::regprocedure AND tgenabled='O') THEN RAISE EXCEPTION 'ORDER_INPUT_GUARD_NOT_ACTIVE';END IF;
END $$;
COMMIT;
