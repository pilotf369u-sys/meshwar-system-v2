-- After the matching clients are deployed. No order/product/stock rows are rewritten.
BEGIN;
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
COMMIT;
