-- READ ONLY: definitions of eight named functions, Storage policies and profile FK metadata.
-- No account rows, tokens, object names, messages, payments or application RPC execution.
BEGIN READ ONLY;
SET LOCAL statement_timeout='8s';
SET LOCAL lock_timeout='500ms';
WITH wanted(signature)AS(VALUES
 ('public.customer_portal_data(text)'),
 ('public.customer_portal_data_v2(text)'),
 ('private.kinto_attachment_actor_v1(text,text)'),
 ('private.kinto_attachment_upload_allowed_v1(text,text,jsonb)'),
 ('public.kinto_attachment_ticket_session_v1(text,text,text,text,text,integer)'),
 ('public.kinto_attachment_read_session_v1(text,text,jsonb)'),
 ('private.review_storage_delete_allowed_v150(text,text)'),
 ('private.require_customer_review_session(text)')
), contracts AS(
 SELECT w.signature,p.oid IS NOT NULL AS exists,
 CASE WHEN p.oid IS NOT NULL THEN pg_get_functiondef(p.oid)END AS definition
 FROM wanted w LEFT JOIN pg_proc p ON p.oid=to_regprocedure(w.signature)
), storage_policies AS(
 SELECT c.relname AS table_name,p.polname AS policy_name,p.polcmd AS command,
 p.polpermissive AS permissive,
 ARRAY(SELECT CASE WHEN x=0 THEN 'PUBLIC'ELSE pg_get_userbyid(x)END FROM unnest(p.polroles)x)AS roles,
 pg_get_expr(p.polqual,p.polrelid)AS using_expression,
 pg_get_expr(p.polwithcheck,p.polrelid)AS check_expression
 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='storage'AND c.relname IN('objects','buckets')
), profile_links AS(
 SELECT f.conrelid::regclass::text AS from_table,f.confrelid::regclass::text AS to_table,pg_get_constraintdef(f.oid)AS definition
 FROM pg_constraint f WHERE f.contype='f'AND(f.conrelid=to_regclass('public.profiles')OR f.confrelid=to_regclass('public.profiles'))
)
SELECT jsonb_build_object(
 'transaction_read_only',current_setting('transaction_read_only'),
 'contracts',(SELECT jsonb_agg(to_jsonb(c)ORDER BY signature)FROM contracts c),
 'storage_policies',coalesce((SELECT jsonb_agg(to_jsonb(p)ORDER BY table_name,policy_name)FROM storage_policies p),'[]'::jsonb),
 'profile_links',coalesce((SELECT jsonb_agg(to_jsonb(f)ORDER BY from_table,to_table,definition)FROM profile_links f),'[]'::jsonb)
)AS session_media_contract_report;
COMMIT;
