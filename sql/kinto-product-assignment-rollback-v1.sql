-- Final-stage rollback only. Retains session routes and validation; no financial rows change.
BEGIN;
DROP TRIGGER IF EXISTS trg_kinto_order_assignment_api_guard_v1 ON public.orders;
GRANT INSERT,UPDATE,DELETE ON public.local_products TO anon,authenticated;
COMMIT;
