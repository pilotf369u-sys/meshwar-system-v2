-- Catalog definitions only. Never invokes notice writers/readers or reads customer rows.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='8s';
SET LOCAL lock_timeout='1s';
WITH targets(signature)AS(VALUES
 ('public.admin_send_customer_notice_v414(text,uuid,text,text,text,text[],boolean)'),
 ('public.admin_send_customer_notice_v420(text,uuid,text,text,text,text[],boolean,text[])'),
 ('public.customer_read_admin_notice_v414(text,uuid)')
), definitions AS(
 SELECT t.signature,p.oid IS NOT NULL AS present,p.prokind::text AS kind,
 CASE WHEN p.oid IS NOT NULL THEN md5(p.prosrc)END AS body_hash,
 CASE WHEN p.prokind='f'THEN octet_length(pg_get_functiondef(p.oid))>131072 ELSE false END AS definition_too_large,
 CASE WHEN p.prokind='f'AND octet_length(pg_get_functiondef(p.oid))<=131072 THEN pg_get_functiondef(p.oid)END AS definition
 FROM targets t LEFT JOIN pg_proc p ON p.oid=to_regprocedure(t.signature)
)
SELECT jsonb_build_object('report_version','kinto-notice-writer-contract-readonly-v1',
 'transaction_read_only',current_setting('transaction_read_only'),
 'functions',(SELECT jsonb_agg(to_jsonb(d)ORDER BY signature)FROM definitions d),
 'application_functions_invoked',false,'customer_or_order_rows_read',false,
 'production_changes_authorized',false)AS notice_contract_report;
COMMIT;
