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
COMMIT;
