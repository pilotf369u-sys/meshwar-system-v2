-- KINTO ACL Stage 1 (review only until approved): remove dangerous DDL-level privileges.
-- No DML; does not change SELECT/INSERT/UPDATE/DELETE, RLS, functions, triggers, data, or sessions.
-- Baseline: 2026-10-16 read-only production audit confirmed direct anon/authenticated
-- TRUNCATE/TRIGGER/REFERENCES grants on precisely the 23 tables below.
-- WARNING: This does NOT fix permissive RLS or protect customer/password rows.
BEGIN;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE
  public.agents,
  public.app_settings,
  public.cart_items,
  public.carts,
  public.currencies,
  public.delivery_settlements,
  public.financial_settlements,
  public.local_orders,
  public.local_products,
  public.local_returns,
  public.merchant_featured_requests,
  public.merchant_featured_slots,
  public.products,
  public.profiles,
  public.settlement_reports,
  public.site_content,
  public.staff,
  public.store_categories,
  public.store_category_media,
  public.stores,
  public.vendor_financial_settlements,
  public.vendor_operating_expenses,
  public.vendor_settlement_archives_v163
FROM anon, authenticated;
DO $$
DECLARE v_table text; v_role text; v_priv text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['agents', 'app_settings', 'cart_items', 'carts', 'currencies', 'delivery_settlements', 'financial_settlements', 'local_orders', 'local_products', 'local_returns', 'merchant_featured_requests', 'merchant_featured_slots', 'products', 'profiles', 'settlement_reports', 'site_content', 'staff', 'store_categories', 'store_category_media', 'stores', 'vendor_financial_settlements', 'vendor_operating_expenses', 'vendor_settlement_archives_v163'] LOOP
    FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
      FOREACH v_priv IN ARRAY ARRAY['TRUNCATE','TRIGGER','REFERENCES'] LOOP
        IF has_table_privilege(v_role,format('public.%I',v_table),v_priv) THEN
          RAISE EXCEPTION 'ACL stage 1 failed: %.% still has %',v_role,v_table,v_priv;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;
COMMIT;
