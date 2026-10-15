-- Prevent a browser-created global link request from being relabelled as
-- a local checkout order after the strict zero-price INSERT gate accepts it.
-- This does NOT lock global pricing, status, delivery, invoices or staff edits.
BEGIN;

CREATE OR REPLACE FUNCTION private.kinto_global_link_no_local_promotion_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE
  v_details jsonb;
  v_items jsonb;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated')
     OR coalesce(OLD.order_code,'') NOT LIKE 'MW-%'
     OR coalesce(OLD.order_url,'') !~* '^https?://'
  THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_details := coalesce(nullif(NEW.details,''),'{}')::jsonb;
  EXCEPTION WHEN others THEN
    v_details := '{}'::jsonb;
  END;

  IF jsonb_typeof(v_details) <> 'object' THEN
    v_details := '{}'::jsonb;
  END IF;

  -- Keep the marker used to identify this global-link row intact. Without
  -- this check a browser could change the code/URL first and bypass the
  -- promotion guard in a second UPDATE.
  IF coalesce(NEW.order_code,'') NOT LIKE 'MW-%'
     OR coalesce(NEW.order_url,'') !~* '^https?://'
  THEN
    RAISE EXCEPTION 'KINTO_GLOBAL_LINK_IDENTITY_LOCKED'
      USING ERRCODE='42501';
  END IF;

  -- The global product-link flow has no store/product/campaign contract.
  IF NEW.order_code IS DISTINCT FROM OLD.order_code
     OR coalesce(NEW.order_url,'') !~* '^https?://'
     OR coalesce(v_details->>'checkout_contract','') <> ''
     OR coalesce(v_details->>'source','') IN ('local_cart_bundle','local_store')
     OR v_details ?| ARRAY['items','stores','store_id','store_segments','product_id',
                            'products','customer_total_local','store_subtotal',
                            'checkout_group_id','vendor_order_id']
     OR NEW.kinto_campaign_id IS DISTINCT FROM OLD.kinto_campaign_id
        AND NEW.kinto_campaign_id IS NOT NULL
  THEN
    RAISE EXCEPTION 'KINTO_GLOBAL_LINK_CANNOT_BECOME_LOCAL'
      USING ERRCODE='42501';
  END IF;

  -- A forged local item array in the separate orders.items field is not
  -- part of the global order.html submission; disallow its introduction
  -- only when it carries a local store/product identity.
  IF NEW.items IS DISTINCT FROM OLD.items AND NEW.items IS NOT NULL THEN
    BEGIN
      v_items := NEW.items::jsonb;
      IF v_items::text ~* '"(store_id|local_product_id|product_id|checkout_contract)"[[:space:]]*:'
      THEN
        RAISE EXCEPTION 'KINTO_GLOBAL_LINK_CANNOT_BECOME_LOCAL'
          USING ERRCODE='42501';
      END IF;
    EXCEPTION WHEN invalid_text_representation THEN
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION private.kinto_global_link_no_local_promotion_v1()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_kinto_global_link_no_local_promotion_v1 ON public.orders;
CREATE TRIGGER trg_kinto_global_link_no_local_promotion_v1
BEFORE UPDATE OF order_code, order_url, details, items, kinto_campaign_id ON public.orders
FOR EACH ROW
EXECUTE FUNCTION private.kinto_global_link_no_local_promotion_v1();

COMMIT;
