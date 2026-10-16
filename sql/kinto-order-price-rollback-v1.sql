-- Emergency rollback of the final direct-price guard only. Existing protections remain.
BEGIN;
DROP TRIGGER IF EXISTS trg_kinto_order_price_api_guard_v1 ON public.orders;
COMMIT;
