-- EMERGENCY ROLLBACK ONLY. Restores the exact Stage 1 ACL baseline captured
-- in the 2026-10-16 production read-only audit. Re-grants dangerous privileges.
-- No data modifications. Do NOT run as part of deployment.
BEGIN;
GRANT TRUNCATE, TRIGGER, REFERENCES ON TABLE
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
TO anon, authenticated;
COMMIT;
