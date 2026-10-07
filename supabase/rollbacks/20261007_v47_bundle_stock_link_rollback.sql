-- Restore the previously installed function without touching historical stock.
BEGIN;
DROP TRIGGER IF EXISTS trg_meshwar_local_cart_bundle_stock_lifecycle ON public.orders;
CREATE TRIGGER trg_meshwar_local_cart_bundle_stock_lifecycle
BEFORE UPDATE OF status ON public.orders FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.meshwar_local_cart_bundle_stock_lifecycle();
NOTIFY pgrst,'reload schema';
COMMIT;
