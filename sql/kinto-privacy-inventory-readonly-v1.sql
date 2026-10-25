-- Metadata only. No customer rows, names, phones, tokens, object paths or function bodies.
-- Does not install the privacy module or enable deletion. Review before running on any live DB.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '8s';
SET LOCAL lock_timeout = '500ms';
WITH columns AS (
  SELECT n.nspname AS schema_name,c.relname AS table_name,a.attname AS column_name,
         format_type(a.atttypid,a.atttypmod) AS data_type,a.attnotnull AS not_null,
         c.relrowsecurity AS rls_enabled,a.attnum AS position
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
  WHERE n.nspname IN ('public','private','storage') AND c.relkind IN ('r','p')
), customer_fks AS (
  SELECT n.nspname AS schema_name,c.relname AS table_name,con.conname AS constraint_name,
         pg_catalog.pg_get_constraintdef(con.oid) AS definition
  FROM pg_catalog.pg_constraint con
  JOIN pg_catalog.pg_class c ON c.oid=con.conrelid
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE con.contype='f' AND con.confrelid=pg_catalog.to_regclass('public.customers')
), writers AS (
  SELECT n.nspname AS schema_name,p.proname AS function_name,
         pg_catalog.pg_get_function_identity_arguments(p.oid) AS arguments,
         md5(p.prosrc) AS body_hash
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('public','private') AND p.prokind='f'
    AND p.prosrc ~* '(customer|messages|chat-attachments|product-review-images|quote_snapshot)'
)
SELECT jsonb_build_object(
  'report_version',1,
  'scope','schema metadata only; not a complete identity or retention inventory',
  'transaction_read_only',current_setting('transaction_read_only'),
  'columns',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY schema_name,table_name,position) FROM columns x),'[]'::jsonb),
  'customer_foreign_keys',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY schema_name,table_name,constraint_name) FROM customer_fks x),'[]'::jsonb),
  'json_columns',coalesce((SELECT jsonb_agg(jsonb_build_object('schema_name',schema_name,'table_name',table_name,'column_name',column_name,'data_type',data_type) ORDER BY schema_name,table_name,position) FROM columns WHERE data_type IN ('json','jsonb')),'[]'::jsonb),
  'candidate_functions',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY schema_name,function_name,arguments) FROM writers x),'[]'::jsonb),
  'unverified',jsonb_build_array('live JSON keys and embedded identity copies','Storage object ownership and orphan media','Edge/server logs and third-party processors','Hostinger/Supabase backup retention and restoration procedure','non-FK logical links and historical schema','app/WebView local data on other devices')
);
COMMIT;
