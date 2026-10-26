-- Owner-run READ ONLY metadata check. No file/object/customer rows or application RPC execution.
-- Missing configuration is UNKNOWN, not proof that version retention is disabled.
BEGIN READ ONLY;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='500ms';
WITH wanted(id) AS (
 VALUES('chat-attachments'::text),('product-review-images'::text)
), capability AS (
 SELECT EXISTS(
  SELECT 1 FROM pg_attribute
  WHERE attrelid=to_regclass('storage.buckets')
   AND attname='versioning_status' AND NOT attisdropped
 ) AS versioning_column_present
)
SELECT jsonb_build_object(
 'transaction_read_only',current_setting('transaction_read_only'),
 'versioning_column_present',(SELECT versioning_column_present FROM capability),
 'buckets',(
  SELECT jsonb_agg(jsonb_build_object(
   'id',w.id,'bucket_present',b.id IS NOT NULL,
   'versioning_status',to_jsonb(b)->>'versioning_status'
  )ORDER BY w.id)
  FROM wanted w LEFT JOIN storage.buckets b ON b.id=w.id
 ),
 'version_related_columns',(
  SELECT coalesce(jsonb_agg(jsonb_build_object(
   'table',c.relname,'column',a.attname
  )ORDER BY c.relname,a.attname),'[]'::jsonb)
  FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='storage' AND c.relname IN('buckets','objects')
   AND a.attnum>0 AND NOT a.attisdropped AND a.attname LIKE '%version%'
 ),
 'storage_service_build_identified',false,
 'upload_quiescence_verified',false,
 'physical_removal_verified',false,
 'production_enable_authorized',false
) AS storage_config_report;
COMMIT;
