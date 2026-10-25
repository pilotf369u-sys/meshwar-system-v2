-- Actual owner-exported invoice definitions on a disposable synthetic fixture only.
-- Vendor actor validator is a test double; this is not a vendor-auth qualification.
\set ON_ERROR_STOP on
BEGIN;
SELECT public.test_assert(to_regprocedure('public.vendor_get_order_segment_details(text,uuid)')IS NULL AND to_regprocedure('private.v94_jsonb_object(jsonb)')IS NULL,'fixture must not overwrite existing invoice functions');
ALTER TABLE public.customers ADD COLUMN country text,ADD COLUMN state text,ADD COLUMN address text,ADD COLUMN secondary_phone text;
ALTER TABLE public.orders DROP CONSTRAINT orders_customer_id_fkey;
ALTER TABLE public.orders ALTER COLUMN customer_id TYPE text USING customer_id::text;
ALTER TABLE public.orders ALTER COLUMN details TYPE text USING details::text;
ALTER TABLE public.order_store_segments ADD COLUMN customer_snapshot jsonb,ADD COLUMN payment_confirmed boolean DEFAULT true,ADD COLUMN store_name_snapshot text DEFAULT 'TEST Store',ADD COLUMN quantity_total integer DEFAULT 1,ADD COLUMN subtotal_local numeric DEFAULT 123,ADD COLUMN currency text DEFAULT 'IQD',ADD COLUMN store_status text DEFAULT 'TEST paid',ADD COLUMN confirmed_at timestamptz DEFAULT now(),ADD COLUMN commission_snapshot jsonb DEFAULT '{}',ADD COLUMN vendor_payment_status text DEFAULT 'pending',ADD COLUMN invoice_version text DEFAULT 'TEST-V96',ADD COLUMN updated_at timestamptz DEFAULT now();
CREATE FUNCTION private.require_vendor_session(p_token text)RETURNS uuid LANGUAGE plpgsql AS $$BEGIN IF p_token IS DISTINCT FROM 'test-invoice-vendor'THEN RAISE EXCEPTION 'TEST_VENDOR_DENIED';END IF;RETURN '00000000-0000-4000-8000-000000000010';END$$;
\ir owner-invoice-contract-fixture.sql
SELECT public.test_assert(private.kinto_privacy_invoice_contract_v1(),'exact owner-exported bodies and headers accepted without replacing production');
INSERT INTO public.customers(id,name,phone,code,password,country,state,address,secondary_phone)VALUES('00000000-0000-4000-8000-000000000097','PRIVATE PROFILE NAME','PRIVATE PHONE','PRIVATE CODE','PRIVATE PASSWORD','PRIVATE COUNTRY','PRIVATE STATE','PRIVATE ADDRESS','PRIVATE SECONDARY');
INSERT INTO public.orders(id,customer_id,status,details)VALUES
 ('00000000-0000-4000-8000-000000000081','00000000-0000-4000-8000-000000000097','TEST unchanged','{}'),
 ('00000000-0000-4000-8000-000000000082','00000000-0000-4000-8000-000000000097','TEST unchanged','{}'),
 ('00000000-0000-4000-8000-000000000083','00000000-0000-4000-8000-000000000097','TEST unchanged','{"customer_name":"FROZEN DETAIL NAME","customer_code":"FROZEN DETAIL CODE","customer_phone":"FROZEN DETAIL PHONE","secondary_phone":"FROZEN DETAIL SECONDARY","country":"FROZEN DETAIL COUNTRY","province":"FROZEN DETAIL STATE","customer_address":"FROZEN DETAIL ADDRESS"}'),
 ('00000000-0000-4000-8000-000000000084','00000000-0000-4000-8000-000000000097','TEST unchanged','{malformed');
INSERT INTO public.order_store_segments(id,order_id,store_id,items_snapshot,customer_snapshot)VALUES
 ('00000000-0000-4000-8000-000000000081','00000000-0000-4000-8000-000000000081','00000000-0000-4000-8000-000000000010','[{"quantity":1,"price":123}]','{"name":"FROZEN NAME","code":"FROZEN CODE","phone":"FROZEN PHONE","secondary_phone":"FROZEN SECONDARY","country":"FROZEN COUNTRY","province":"FROZEN STATE","address":"FROZEN ADDRESS"}'),
 ('00000000-0000-4000-8000-000000000082','00000000-0000-4000-8000-000000000082','00000000-0000-4000-8000-000000000010','[{"quantity":1,"price":123}]','{"name":"FROZEN PARTIAL NAME"}'),
 ('00000000-0000-4000-8000-000000000083','00000000-0000-4000-8000-000000000083','00000000-0000-4000-8000-000000000010','[{"quantity":1,"price":123}]','{}'),
 ('00000000-0000-4000-8000-000000000084','00000000-0000-4000-8000-000000000084','00000000-0000-4000-8000-000000000010','[{"quantity":1,"price":123}]','{"name":"FROZEN MALFORMED NAME"}');
CREATE TEMP TABLE invoice_initial AS SELECT s.id,to_jsonb(o)order_context,s.customer_snapshot,to_jsonb(c)profile,
 private.kinto_privacy_invoice_dependency_v1(to_jsonb(o),s.customer_snapshot,to_jsonb(c))dependency,
 private.kinto_privacy_invoice_projection_v1(to_jsonb(o),s.customer_snapshot,private.v94_jsonb_object(to_jsonb(o)->'details'),to_jsonb(c))expected_customer
 FROM public.order_store_segments s JOIN public.orders o ON o.id=s.order_id JOIN public.customers c ON c.id::text=o.customer_id WHERE c.id='00000000-0000-4000-8000-000000000097';
SELECT public.test_assert((SELECT dependency->'profile_dependent_fields'='[]'::jsonb FROM invoice_initial WHERE id='00000000-0000-4000-8000-000000000081'),'full snapshot does not use profile fallback');
SELECT public.test_assert((SELECT jsonb_array_length(dependency->'profile_dependent_fields')=6 FROM invoice_initial WHERE id='00000000-0000-4000-8000-000000000082'),'nonempty partial snapshot still depends on six profile fields');
SELECT public.test_assert((SELECT dependency->'profile_dependent_fields'='[]'::jsonb FROM invoice_initial WHERE id='00000000-0000-4000-8000-000000000083'),'TEXT order details can supply identity even with empty segment snapshot');
SELECT public.test_assert((SELECT dependency->>'readable_context'='false'FROM invoice_initial WHERE id='00000000-0000-4000-8000-000000000084'),'malformed legacy details cannot masquerade as independent invoice');
SAVEPOINT actual_legacy_read;
DO $$DECLARE row record;response jsonb;BEGIN FOR row IN SELECT *FROM invoice_initial LOOP
 response:=public.vendor_get_order_segment_details('test-invoice-vendor',row.id);
 PERFORM public.test_assert(response->'customer'=row.expected_customer,'projection equals actual exported invoice reader result');
END LOOP;END$$;
SELECT public.test_assert((SELECT customer_snapshot FROM public.order_store_segments WHERE id='00000000-0000-4000-8000-000000000082')IS DISTINCT FROM(SELECT customer_snapshot FROM invoice_initial WHERE id='00000000-0000-4000-8000-000000000082'),'legacy reader really repairs the partial snapshot during read in fixture');
ROLLBACK TO actual_legacy_read;
CREATE TEMP TABLE invoice_preserved AS SELECT(SELECT jsonb_agg(to_jsonb(o)ORDER BY id)FROM public.orders o)orders,(SELECT jsonb_agg(to_jsonb(s)ORDER BY id)FROM public.order_store_segments s)segments,(SELECT jsonb_agg(to_jsonb(c)ORDER BY id)FROM public.customers c)customers;
INSERT INTO private.kinto_deletion_requests_v1(id,customer_id,status,verified_by)VALUES('00000000-0000-4000-8000-000000000098','00000000-0000-4000-8000-000000000097','verified','00000000-0000-4000-8000-000000000099');
CREATE TEMP TABLE invoice_assessment AS SELECT public.kinto_privacy_transaction_preview_admin_v1('test-admin','00000000-0000-4000-8000-000000000098')report;
SELECT public.test_assert((SELECT report->'sections'->'segments'->>'legacy_contract_verified'='true'AND report->'sections'->'segments'->>'profile_dependent_invoices'='1'AND report->'sections'->'segments'->>'dependency_context_unreadable'='1'FROM invoice_assessment),'admin sees one dependent invoice and one unknown context, not raw fields');
SELECT public.test_assert((SELECT report::text NOT LIKE '%PRIVATE%'AND report::text NOT LIKE '%FROZEN%'AND report->>'deletion_authorized'='false'AND report->>'coverage_complete'='false'FROM invoice_assessment),'assessment reveals no personal/snapshot values or full erasure authority');
SELECT public.test_assert((SELECT orders FROM invoice_preserved)=(SELECT jsonb_agg(to_jsonb(o)ORDER BY id)FROM public.orders o)AND(SELECT segments FROM invoice_preserved)=(SELECT jsonb_agg(to_jsonb(s)ORDER BY id)FROM public.order_store_segments s)AND(SELECT customers FROM invoice_preserved)=(SELECT jsonb_agg(to_jsonb(c)ORDER BY id)FROM public.customers c),'new assessment does not perform legacy repairs or mutate business rows');
SAVEPOINT drifted_invoice;
CREATE OR REPLACE FUNCTION private.v94_jsonb_object(p_value jsonb)RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$SELECT '{}'::jsonb$$;
SELECT public.test_assert(NOT private.kinto_privacy_invoice_contract_v1(),'changed live helper invalidates assumption');
SELECT public.test_assert(public.kinto_privacy_transaction_preview_admin_v1('test-admin','00000000-0000-4000-8000-000000000098')->'sections'->'segments'->>'legacy_contract_verified'='false'AND public.kinto_privacy_transaction_preview_admin_v1('test-admin','00000000-0000-4000-8000-000000000098')->'sections'->'segments'->'profile_dependent_invoices'='null'::jsonb,'drift cannot appear as zero dependencies');
ROLLBACK TO drifted_invoice;
-- Simulate profile removal inside this disposable rollback-only transaction.
DELETE FROM public.customers WHERE id='00000000-0000-4000-8000-000000000097';
DO $$DECLARE row record;response jsonb;changed jsonb;BEGIN FOR row IN SELECT *FROM invoice_initial WHERE dependency->>'readable_context'='true'LOOP
 response:=public.vendor_get_order_segment_details('test-invoice-vendor',row.id);
 SELECT coalesce(jsonb_agg(k ORDER BY k),'[]')INTO changed FROM jsonb_object_keys(row.expected_customer)k WHERE row.expected_customer->k IS DISTINCT FROM response->'customer'->k;
 PERFORM public.test_assert(changed=row.dependency->'profile_dependent_fields','predicted loss equals actual reader after profile removal');
END LOOP;END$$;
ROLLBACK;
SELECT 'PASS_INVOICE_PROFILE_DEPENDENCY: actual exported contract, full/partial/TEXT-details/malformed cases, predicted field loss matches real reader, legacy read-repair isolated and rolled back, new admin assessment writes no business rows, drift is unknown not zero';
