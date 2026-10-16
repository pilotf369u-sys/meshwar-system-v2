BEGIN;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.local_stores TO anon,authenticated;
DO $$ DECLARE f regprocedure; BEGIN
 FOR f IN SELECT p.oid::regprocedure FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname=ANY(ARRAY[
 'admin_save_local_store','save_global_store','update_global_store','delete_global_store','save_site_content','admin_list_product_reviews_v138','admin_get_review_image_v139','admin_delete_product_review_image_v152','admin_moderate_product_review_v138',
 'vendor_get_profit_margin','vendor_set_profit_margin','vendor_set_exchange_rate','vendor_get_operating_expenses','vendor_add_operating_expense','vendor_get_financial_periods','vendor_submit_featured_request','vendor_list_featured_requests']) LOOP
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon,authenticated',f);END LOOP;
END $$;
COMMIT;
