-- Owner-run catalog read only. Does not invoke the invoice reader (which may write).
-- No account/order/customer rows, deployment, function replacement or policy change.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='8s';
SET LOCAL lock_timeout='1s';
WITH targets(signature)AS(VALUES
 ('public.vendor_get_order_segment_details(text,uuid)'),
 ('private.v94_jsonb_object(jsonb)')
), definitions AS(
 SELECT t.signature,p.oid IS NOT NULL AS present,p.prokind::text AS kind,
        CASE WHEN p.oid IS NOT NULL THEN md5(p.prosrc)END AS body_hash,
        CASE WHEN p.oid IS NOT NULL AND octet_length(pg_get_functiondef(p.oid))<=131072 THEN pg_get_functiondef(p.oid)END AS definition,
        coalesce(octet_length(pg_get_functiondef(p.oid))>131072,false)AS definition_too_large
 FROM targets t LEFT JOIN pg_proc p ON p.oid=to_regprocedure(t.signature)
)
SELECT jsonb_build_object('report_version','kinto-invoice-contract-readonly-v1',
 'transaction_read_only',current_setting('transaction_read_only'),
 'functions',(SELECT jsonb_agg(to_jsonb(d)ORDER BY signature)FROM definitions d),
 'application_functions_invoked',false,'customer_or_order_rows_read',false,
 'production_changes_authorized',false)AS invoice_contract_report;
COMMIT;
