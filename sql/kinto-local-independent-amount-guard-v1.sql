-- KINTO local independent vendor order amount lock v1
-- REVIEW FIRST. Run manually in Supabase SQL Editor after approving PR.
-- No data backfill, no order/status/stock/shipping changes.
-- Scope deliberately limited to orders with checkout_contract='independent_vendor_orders'.
-- Legacy local orders and direct INSERT permissions require a separate audit.
BEGIN;

CREATE OR REPLACE FUNCTION private.kinto_local_independent_amount_guard_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, pg_temp
AS $fn$
DECLARE
  v_old_details jsonb;
  v_new_details jsonb;
  v_projection jsonb;
BEGIN
  -- Avoid changing the global/legacy order pricing workflow.
  v_old_details := private.v94_jsonb_object(to_jsonb(OLD.details));
  IF coalesce(v_old_details->>'checkout_contract', '') <> 'independent_vendor_orders' THEN
    RETURN NEW;
  END IF;

  IF NEW.total_price IS NOT DISTINCT FROM OLD.total_price
     AND NEW.currency IS NOT DISTINCT FROM OLD.currency THEN
    RETURN NEW;
  END IF;

  -- Order currency is fixed by the checkout's trusted store calculation.
  IF NEW.currency IS DISTINCT FROM OLD.currency THEN
    RAISE EXCEPTION 'KINTO_LOCAL_ORDER_CURRENCY_LOCKED' USING ERRCODE='42501';
  END IF;

  -- Preserve the existing customer invoice/stock correction (V58/V59).
  -- Never allow a free-form price update, even when the invoice GUC is present.
  IF current_setting('kinto.invoice_adjustment_v58', true) = OLD.id::text
     AND OLD.status = ANY(ARRAY[
       'بانتظار موافقة العميل',
       'بانتظار موافقة الزبون',
       'بانتظار التسعير',
       'تم التسعير / بانتظار موافقة العميل'
     ])
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND coalesce(v_old_details->>'bundle_stock_lifecycle_state','') <> 'deducted'
  THEN
    v_projection := private.invoice_stock_projection_v59(OLD);
    v_new_details := private.v94_jsonb_object(to_jsonb(NEW.details));
    IF v_projection->>'changed' = 'true'
       AND NEW.total_price IS NOT DISTINCT FROM (v_projection->>'total_price')::numeric
       AND v_new_details = v_projection->'details'
    THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'KINTO_LOCAL_ORDER_AMOUNT_LOCKED' USING ERRCODE='42501';
END;
$fn$;

REVOKE ALL ON FUNCTION private.kinto_local_independent_amount_guard_v1()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_kinto_local_independent_amount_guard_v1 ON public.orders;
CREATE TRIGGER trg_kinto_local_independent_amount_guard_v1
BEFORE UPDATE OF total_price, currency ON public.orders
FOR EACH ROW
EXECUTE FUNCTION private.kinto_local_independent_amount_guard_v1();

COMMIT;

-- Read-only post-deployment verification:
-- SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger
-- WHERE tgrelid='public.orders'::regclass
--   AND tgname='trg_kinto_local_independent_amount_guard_v1';
