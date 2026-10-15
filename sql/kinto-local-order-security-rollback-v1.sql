-- KINTO PR #964 emergency rollback.
-- Run ONLY if the two PR #964 guards have been deployed and a workflow breaks.
-- This does not alter orders, stock, invoice data, or older triggers.
BEGIN;
DROP TRIGGER IF EXISTS trg_kinto_local_order_insert_gate_v1 ON public.orders;
DROP TRIGGER IF EXISTS trg_kinto_local_independent_amount_guard_v1 ON public.orders;
DROP FUNCTION IF EXISTS private.kinto_local_order_insert_gate_v1();
DROP FUNCTION IF EXISTS private.kinto_local_independent_amount_guard_v1();
COMMIT;

-- Verification:
-- SELECT tgname FROM pg_trigger
-- WHERE tgrelid='public.orders'::regclass
-- AND tgname IN ('trg_kinto_local_order_insert_gate_v1',
--                'trg_kinto_local_independent_amount_guard_v1');
-- Expected: no rows.
