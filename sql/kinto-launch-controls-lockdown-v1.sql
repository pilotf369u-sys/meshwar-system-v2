-- Combined launch controls: execute this file as one transaction.
BEGIN;

-- After the matching clients are deployed. No order/product/stock rows are rewritten.

DO $$ DECLARE cols text; f regprocedure; BEGIN
 IF to_regprocedure('public.kinto_store_operation_session_v1(text,text,text,jsonb)') IS NULL THEN RAISE EXCEPTION 'INSTALL_STORE_SESSIONS_FIRST'; END IF;
 REVOKE INSERT,UPDATE,DELETE,SELECT ON public.local_stores FROM PUBLIC,anon,authenticated;
 SELECT string_agg(quote_ident(attname),',') INTO cols FROM pg_attribute WHERE attrelid='public.local_stores'::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE format('REVOKE SELECT (%1$s),INSERT (%1$s),UPDATE (%1$s) ON public.local_stores FROM PUBLIC,anon,authenticated',cols);
 SELECT string_agg(quote_ident(attname),',') INTO cols FROM pg_attribute WHERE attrelid='public.local_stores'::regclass AND attnum>0 AND NOT attisdropped AND attname<>'password_hash';
 EXECUTE format('GRANT SELECT (%s) ON public.local_stores TO anon,authenticated',cols);
 FOR f IN SELECT p.oid::regprocedure FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname=ANY(ARRAY[
 'admin_save_local_store','save_global_store','update_global_store','delete_global_store','save_site_content','admin_list_product_reviews_v138','admin_get_review_image_v139','admin_delete_product_review_image_v152','admin_moderate_product_review_v138',
 'vendor_get_profit_margin','vendor_set_profit_margin','vendor_set_exchange_rate','vendor_get_operating_expenses','vendor_add_operating_expense','vendor_get_financial_periods','vendor_submit_featured_request','vendor_list_featured_requests']) LOOP
  EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC,anon,authenticated',f);
  IF has_function_privilege('anon',f,'EXECUTE') OR has_function_privilege('authenticated',f,'EXECUTE') THEN RAISE EXCEPTION 'STORE_LEGACY_EXECUTE_LOCK_FAILED'; END IF;
 END LOOP;
 IF has_any_column_privilege('anon','public.local_stores','UPDATE') OR has_table_privilege('anon','public.local_stores','DELETE') OR has_column_privilege('anon','public.local_stores','password_hash','SELECT')
 OR has_any_column_privilege('authenticated','public.local_stores','UPDATE') OR has_table_privilege('authenticated','public.local_stores','DELETE') OR has_column_privilege('authenticated','public.local_stores','password_hash','SELECT') THEN RAISE EXCEPTION 'STORE_LOCK_FAILED'; END IF;
END $$;

-- Activate only after session SQL, attachment Edge deployment and client rollout are verified.

DO $$ DECLARE t text;cols text; BEGIN
 IF to_regprocedure('public.kinto_attachment_read_session_v1(text,text,jsonb)') IS NULL OR to_regprocedure('public.kinto_category_write_session_v1(text,text,uuid,jsonb)') IS NULL THEN RAISE EXCEPTION 'INSTALL_CONTROL_SURFACE_SESSIONS_FIRST'; END IF;
 FOREACH t IN ARRAY ARRAY['store_categories','store_category_media','currencies','local_orders','local_returns'] LOOP
  EXECUTE format('REVOKE INSERT,UPDATE,DELETE ON public.%I FROM PUBLIC,anon,authenticated',t);
  SELECT string_agg(quote_ident(attname),',') INTO cols FROM pg_attribute WHERE attrelid=format('public.%I',t)::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE INSERT (%1$s),UPDATE (%1$s) ON public.%2$I FROM PUBLIC,anon,authenticated',cols,t);
 END LOOP;
 REVOKE ALL ON public.agents FROM PUBLIC,anon,authenticated;
 FOREACH t IN ARRAY ARRAY['local_orders','local_returns','financial_settlements'] LOOP
  EXECUTE format('DROP POLICY IF EXISTS kinto_legacy_store_read_v1 ON public.%I',t);
  EXECUTE format('CREATE POLICY kinto_legacy_store_read_v1 ON public.%I AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(private.kinto_legacy_store_scope_v1(store_id::text))',t);
 END LOOP;
END $$;
ALTER VIEW public.local_store_financial_summary SET(security_invoker=true);
DROP POLICY IF EXISTS kinto_legacy_finance_insert_v1 ON public.financial_settlements;
CREATE POLICY kinto_legacy_finance_insert_v1 ON public.financial_settlements AS RESTRICTIVE FOR INSERT TO anon,authenticated WITH CHECK(private.kinto_legacy_store_scope_v1(store_id::text));
DROP POLICY IF EXISTS kinto_remaining_asset_insert_v1 ON storage.objects;
CREATE POLICY kinto_remaining_asset_insert_v1 ON storage.objects AS RESTRICTIVE FOR INSERT TO anon,authenticated
 WITH CHECK(CASE WHEN bucket_id='chat-attachments' THEN private.kinto_attachment_upload_allowed_v1(bucket_id,name,metadata)
 WHEN bucket_id='product-review-images' THEN private.review_storage_upload_allowed_v150(bucket_id,name,metadata)
 WHEN bucket_id IN ('category-images','cms-media') THEN false ELSE true END);
DROP POLICY IF EXISTS kinto_remaining_asset_update_v1 ON storage.objects;
CREATE POLICY kinto_remaining_asset_update_v1 ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon,authenticated
 USING(bucket_id NOT IN ('chat-attachments','product-review-images','category-images','cms-media'))
 WITH CHECK(bucket_id NOT IN ('chat-attachments','product-review-images','category-images','cms-media'));
DROP POLICY IF EXISTS kinto_remaining_asset_delete_v1 ON storage.objects;
CREATE POLICY kinto_remaining_asset_delete_v1 ON storage.objects AS RESTRICTIVE FOR DELETE TO anon,authenticated
 USING(CASE WHEN bucket_id='product-review-images' THEN private.review_storage_delete_allowed_v150(bucket_id,name)
 WHEN bucket_id IN ('chat-attachments','category-images','cms-media') THEN false ELSE true END);
DROP POLICY IF EXISTS kinto_attachment_listing_v1 ON storage.objects;
CREATE POLICY kinto_attachment_listing_v1 ON storage.objects AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(bucket_id<>'chat-attachments');
UPDATE storage.buckets SET public=false WHERE id='chat-attachments';

COMMIT;
