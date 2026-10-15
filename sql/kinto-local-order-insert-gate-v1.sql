-- KINTO local order direct INSERT gate v1
-- Review and run manually in Supabase SQL Editor before merging PR.
-- SECURITY INVOKER is intentional: current_user reflects the role doing INSERT.
-- Canonical checkout functions execute as SECURITY DEFINER (postgres), while
-- browser REST inserts execute as anon/authenticated. Campaign checkout calls
-- the canonical engine via a SECURITY DEFINER chain.
-- No change to global legacy direct INSERT (order.html) or existing rows.
BEGIN;

CREATE OR REPLACE FUNCTION private.kinto_local_order_insert_gate_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, private, pg_temp
AS $fn$
DECLARE
  v_details jsonb;
  v_source text;
  v_contract text;
BEGIN
  -- Parse without calling private helper functions: anon must be able to
  -- execute this SECURITY INVOKER trigger on the global order path.
  BEGIN
    v_details := coalesce(NEW.details,'{}')::jsonb;
    IF jsonb_typeof(v_details) <> 'object' THEN
      v_details := '{}'::jsonb;
    END IF;
  EXCEPTION WHEN invalid_text_representation THEN
    v_details := '{}'::jsonb;
  END;
  v_source := coalesce(v_details->>'source','');
  v_contract := coalesce(v_details->>'checkout_contract','');

  IF (v_source IN ('local_cart_bundle','local_store')
      OR v_contract='independent_vendor_orders')
     AND current_user IN ('anon','authenticated')
  THEN
    RAISE EXCEPTION 'KINTO_LOCAL_ORDER_CHECKOUT_REQUIRED'
      USING ERRCODE='42501';
  END IF;

  RETURN NEW;
END;
$fn$;

-- Trigger functions cannot be invoked as a standalone RPC.
REVOKE ALL ON FUNCTION private.kinto_local_order_insert_gate_v1()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_kinto_local_order_insert_gate_v1 ON public.orders;
CREATE TRIGGER trg_kinto_local_order_insert_gate_v1
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION private.kinto_local_order_insert_gate_v1();

COMMIT;

-- Notes:
-- This gates local-tagged orders only. It does not replace the need for
-- an eventual general order creation authorization review.
-- The existing checkout engine computes prices from local_products/local_stores.
