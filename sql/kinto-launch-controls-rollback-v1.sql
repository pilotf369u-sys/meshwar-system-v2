-- Combined launch controls: execute this file as one transaction.
BEGIN;

DROP POLICY IF EXISTS kinto_remaining_asset_insert_v1 ON storage.objects;
DROP POLICY IF EXISTS kinto_remaining_asset_update_v1 ON storage.objects;
DROP POLICY IF EXISTS kinto_remaining_asset_delete_v1 ON storage.objects;
DROP POLICY IF EXISTS kinto_attachment_listing_v1 ON storage.objects;
UPDATE storage.buckets SET public=true WHERE id='chat-attachments';
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['local_orders','local_returns','financial_settlements'] LOOP EXECUTE format('DROP POLICY IF EXISTS kinto_legacy_store_read_v1 ON public.%I',t);END LOOP;
END $$;
DROP POLICY IF EXISTS kinto_legacy_finance_insert_v1 ON public.financial_settlements;
ALTER VIEW public.local_store_financial_summary SET(security_invoker=true);
ALTER VIEW IF EXISTS public.active_merchant_slots_view SET(security_invoker=false);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.agents,public.store_categories,public.store_category_media,public.currencies,public.local_orders,public.local_returns TO anon,authenticated;

GRANT SELECT,INSERT,UPDATE,DELETE ON public.local_stores TO anon,authenticated;
DO $$ DECLARE f regprocedure; BEGIN
 FOR f IN SELECT p.oid::regprocedure FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname=ANY(ARRAY[
 'admin_save_local_store','save_global_store','update_global_store','delete_global_store','save_site_content','admin_list_product_reviews_v138','admin_get_review_image_v139','admin_delete_product_review_image_v152','admin_moderate_product_review_v138',
 'vendor_get_profit_margin','vendor_set_profit_margin','vendor_set_exchange_rate','vendor_get_operating_expenses','vendor_add_operating_expense','vendor_get_financial_periods','vendor_submit_featured_request','vendor_list_featured_requests']) LOOP
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon,authenticated',f);END LOOP;
END $$;

COMMIT;
