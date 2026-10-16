-- Emergency rollback only; reopens direct settlement access/markers.
BEGIN;
DROP TRIGGER IF EXISTS trg_kinto_order_settlement_guard_v1 ON public.orders;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.settlements TO anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.delivery_settlements TO anon,authenticated;
-- New nullable metadata columns and additive RPCs stay installed. No records are changed.
COMMIT;
