-- Run once for review. Catalog/function definitions + three known bucket settings only.
-- No customer rows, sessions, object paths, payment records or application RPC calls.
BEGIN READ ONLY;
SET LOCAL statement_timeout='8s';
SET LOCAL lock_timeout='500ms';
WITH RECURSIVE roots(oid) AS (
 SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN('public','private') AND c.relkind IN('r','p')
 AND c.relname IN(
 'customers','profiles','customer_local_carts','customer_favorite_lists',
 'customer_favorite_items','customer_notification_reads_v155',
 'customer_review_sessions','customer_portal_sessions','product_reviews',
 'product_review_images','product_review_image_payloads',
 'product_review_upload_tickets_v150','product_review_storage_deletions_v150',
 'messages','orders','local_orders','order_store_segments',
 'kinto_world_orders_v1','kinto_world_events_v1','kinto_world_receipts_v1',
 'kinto_world_fulfillment_v1','kinto_world_fulfillment_events_v1',
 'kinto_payment_attempts_p4','kinto_payments_p5',
 'kinto_loyalty_wallets','kinto_loyalty_coupons','kinto_loyalty_ledger',
 'kinto_campaign_awards','kinto_deals_v1_redemptions',
 'kinto_customer_admin_notice_recipients')
), scope(oid) AS (
 SELECT oid FROM roots
 UNION
 SELECT f.conrelid FROM pg_constraint f JOIN scope s ON s.oid=f.confrelid
 WHERE f.contype='f'
), foreign_keys AS (
 SELECT n.nspname AS schema_name,c.relname AS table_name,
 f.conname AS constraint_name,pg_get_constraintdef(f.oid) AS definition
 FROM pg_constraint f JOIN pg_class c ON c.oid=f.conrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE f.contype='f' AND n.nspname IN('public','private')
), triggers AS (
 SELECT n.nspname AS schema_name,c.relname AS table_name,t.tgname AS trigger_name,
 t.tgenabled AS enabled,pg_get_triggerdef(t.oid) AS trigger_definition,
 p.oid::regprocedure::text AS function_signature,
 pg_get_functiondef(p.oid) AS function_definition
 FROM pg_trigger t JOIN scope s ON s.oid=t.tgrelid
 JOIN pg_class c ON c.oid=t.tgrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_proc p ON p.oid=t.tgfoid
 WHERE NOT t.tgisinternal AND n.nspname IN('public','private')
)
SELECT jsonb_build_object(
 'transaction_read_only',current_setting('transaction_read_only'),
 'foreign_keys',coalesce((SELECT jsonb_agg(to_jsonb(x)ORDER BY schema_name,table_name,constraint_name)FROM foreign_keys x),'[]'::jsonb),
 'triggers',coalesce((SELECT jsonb_agg(to_jsonb(x)ORDER BY schema_name,table_name,trigger_name)FROM triggers x),'[]'::jsonb),
 'storage_buckets',coalesce((SELECT jsonb_agg(jsonb_build_object('id',b.id,'public',b.public,'file_size_limit',b.file_size_limit,'allowed_mime_types',b.allowed_mime_types)ORDER BY b.id)FROM storage.buckets b WHERE b.id IN('chat-attachments','product-review-images','kinto-customer-notice-media')),'[]'::jsonb)
) AS dependency_report;
COMMIT;
