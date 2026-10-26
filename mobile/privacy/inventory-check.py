"""Run metadata-only SQL on the existing disposable fixture; never contact production."""
import json,os,pathlib,subprocess
if os.environ.get('KINTO_DISPOSABLE_TEST')!='1' or os.environ.get('PGHOST')!='127.0.0.1' or os.environ.get('PGDATABASE')!='kinto_privacy_test':
    raise SystemExit('DISPOSABLE_DATABASE_REQUIRED')
root=pathlib.Path(__file__).resolve().parents[2]
def psql(*args):
    return subprocess.check_output(['psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1',*args],text=True).strip()
# Protect actual fixture data, function bodies and installed table inventory across inspection.
snapshot="""SELECT jsonb_build_object('orders',(SELECT jsonb_agg(to_jsonb(o)ORDER BY id)FROM public.orders o),'customers',(SELECT jsonb_agg(to_jsonb(c)ORDER BY id)FROM public.customers c),'functions',(SELECT jsonb_object_agg(p.oid::text,md5(pg_get_functiondef(p.oid)))FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','private')AND p.prokind='f'),'relations',(SELECT jsonb_agg(n.nspname||'.'||c.relname ORDER BY n.nspname,c.relname)FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','private')AND c.relkind IN('r','p')));"""
before=psql('-c',snapshot)
report=json.loads(psql('-f',str(root/'sql/kinto-privacy-inventory-readonly-v1.sql')))
assert report['transaction_read_only']=='on'
assert any(x['table_name']=='customers'and x['column_name']=='id'for x in report['columns'])
assert any(x['table_name']=='orders'and x['column_name']=='details'for x in report['json_columns'])
assert any(x['table_name']=='orders'for x in report['customer_foreign_keys'])
assert psql('-c',snapshot)==before,'metadata inspection changed data or installed code'
assert 'TEST A'not in json.dumps(report)and 'test-TEST-A'not in json.dumps(report),'row identity leaked'
print('PASS_METADATA_INVENTORY: read-only transaction, expected JSON/FK evidence, no row identity, customer/order/function/schema state unchanged')

# The second query must expose indirect relationships and insert guards, not customer rows.
before=psql('-c',snapshot)
deps=json.loads(psql('-f',str(root/'sql/kinto-privacy-dependencies-readonly-v1.sql')))
assert deps['transaction_read_only']=='on'
assert any(x['table_name']=='product_review_images'and 'review_id'in x['definition']for x in deps['foreign_keys'])
assert any(x['trigger_name']=='kinto_review_terms_v1'and 'kinto_review_terms_guard_v1'in x['function_definition']for x in deps['triggers'])
assert {x['id']for x in deps['storage_buckets']}=={'chat-attachments','product-review-images'}
assert psql('-c',snapshot)==before
assert 'TEST A'not in json.dumps(deps)and 'test-TEST-A'not in json.dumps(deps)
print('PASS_DEPENDENCY_INVENTORY: indirect FK and trigger definitions reported, buckets allowlisted, read-only and fixture state unchanged')

# Close the specific observed portal-session and attachment-policy gaps, not a row inventory.
before=psql('-c',snapshot)
contracts=json.loads(psql('-f',str(root/'sql/kinto-privacy-session-media-contract-readonly-v1.sql')))
assert contracts['transaction_read_only']=='on'
assert len(contracts['contracts'])==8
assert any(x['signature']=='private.require_customer_review_session(text)'and x['exists']and 'CREATE OR REPLACE FUNCTION'in x['definition']for x in contracts['contracts'])
assert any(x['signature']=='public.customer_portal_data_v2(text)'and not x['exists']and x['definition']is None for x in contracts['contracts'])
assert psql('-c',snapshot)==before
assert 'test-TEST-A'not in json.dumps(contracts)
print('PASS_SESSION_MEDIA_CONTRACT_INSPECTION: eight named definitions/missing markers, policy and profile-FK metadata, read-only and fixture state unchanged')

# Two allowlisted bucket configurations, never object names or a guessed server version.
query_path=root/'sql/kinto-privacy-storage-config-readonly-v1.sql'
before=psql('-c',snapshot)
storage_before=psql('-c',"SELECT jsonb_agg(to_jsonb(b)ORDER BY id)FROM storage.buckets b")
config=json.loads(psql('-f',str(query_path)))
assert config['transaction_read_only']=='on'
assert config['versioning_column_present']is True
assert {x['id']for x in config['buckets']}=={'chat-attachments','product-review-images'}
assert all(x['versioning_status']=='DISABLED'for x in config['buckets'])
assert config['storage_service_build_identified']is False and config['upload_quiescence_verified']is False
assert config['physical_removal_verified']is False and config['production_enable_authorized']is False
assert psql('-c',snapshot)==before
assert psql('-c',"SELECT jsonb_agg(to_jsonb(b)ORDER BY id)FROM storage.buckets b")==storage_before
try:
 # Synthetic schema variants only; the inspected owner query itself contains no DDL.
 psql('-c',"ALTER TABLE storage.buckets ADD COLUMN test_private_canary text DEFAULT 'SYNTHETIC_BUCKET_CANARY';UPDATE storage.buckets SET versioning_status=CASE WHEN id='chat-attachments'THEN 'ENABLED'ELSE 'DISABLED'END;")
 variant_before=psql('-c',"SELECT jsonb_agg(to_jsonb(b)ORDER BY id)FROM storage.buckets b")
 enabled=json.loads(psql('-f',str(query_path)))
 assert enabled['versioning_column_present']is True
 assert {x['id']:x['versioning_status']for x in enabled['buckets']}=={'chat-attachments':'ENABLED','product-review-images':'DISABLED'}
 assert 'SYNTHETIC_BUCKET_CANARY'not in json.dumps(enabled)and 'private-unrelated-test'not in json.dumps(enabled)
 assert enabled['storage_service_build_identified']is False and enabled['physical_removal_verified']is False
 assert psql('-c',"SELECT jsonb_agg(to_jsonb(b)ORDER BY id)FROM storage.buckets b")==variant_before
finally:
 psql('-c',"ALTER TABLE storage.buckets DROP COLUMN test_private_canary;UPDATE storage.buckets SET versioning_status='DISABLED';")
try:
 psql('-c','ALTER TABLE storage.buckets DROP COLUMN versioning_status;')
 legacy=json.loads(psql('-f',str(query_path)))
 assert legacy['versioning_column_present']is False and all(x['versioning_status']is None for x in legacy['buckets'])
 assert legacy['physical_removal_verified']is False
finally:
 psql('-c',"ALTER TABLE storage.buckets ADD COLUMN versioning_status text DEFAULT 'DISABLED';")
assert psql('-c',snapshot)==before
assert psql('-c',"SELECT jsonb_agg(to_jsonb(b)ORDER BY id)FROM storage.buckets b")==storage_before
print('PASS_STORAGE_CONFIG_INSPECTION: read-only, two bucket configurations only, absent/available versioning field handled without inference, no object rows/private canary and no changes')

# Exact invoice catalog contracts only. Never call a legacy invoice reader to inspect it.
invoice_query=root/'sql/kinto-privacy-invoice-contract-readonly-v1.sql'
before=psql('-c',snapshot)
missing=json.loads(psql('-f',str(invoice_query)))
assert missing['transaction_read_only']=='on'
assert len(missing['functions'])==2
assert all(not r['present']and r['definition']is None for r in missing['functions'])
assert psql('-c',snapshot)==before
try:
 # Deliberately raise if invoked; a successful report proves catalog inspection only.
 psql('-c',"CREATE FUNCTION public.vendor_get_order_segment_details(p_session_token text,p_segment_id uuid)RETURNS jsonb LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'INVOICE_MUST_NOT_RUN';END$$;CREATE FUNCTION private.v94_jsonb_object(p_value jsonb)RETURNS jsonb LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'HELPER_MUST_NOT_RUN';END$$;CREATE FUNCTION public.vendor_get_order_segment_details(p_session_token text,p_segment_id text)RETURNS text LANGUAGE sql AS $$SELECT 'UNRELATED_OVERLOAD_CANARY'::text$$;")
 invoice_before=psql('-c',snapshot)
 invoice=json.loads(psql('-f',str(invoice_query)))
 assert invoice['transaction_read_only']=='on'and len(invoice['functions'])==2
 assert {r['signature']for r in invoice['functions']}=={'public.vendor_get_order_segment_details(text,uuid)','private.v94_jsonb_object(jsonb)'}
 assert all(r['present']and r['kind']=='f'and len(r['body_hash'])==32 and r['definition']and not r['definition_too_large']for r in invoice['functions'])
 assert 'UNRELATED_OVERLOAD_CANARY'not in json.dumps(invoice)
 assert invoice['application_functions_invoked']is False and invoice['customer_or_order_rows_read']is False
 assert invoice['production_changes_authorized']is False
 assert psql('-c',snapshot)==invoice_before
 # Report a whole-definition overflow explicitly instead of returning a misleading prefix.
 psql('-c',"DO $test$BEGIN EXECUTE 'CREATE OR REPLACE FUNCTION private.v94_jsonb_object(p_value jsonb)RETURNS jsonb LANGUAGE plpgsql AS '||quote_literal('BEGIN /*'||repeat('X',132000)||'*/ RAISE EXCEPTION ''HELPER_MUST_NOT_RUN'';END');END$test$;")
 large_before=psql('-c',snapshot)
 large=json.loads(psql('-f',str(invoice_query)))
 helper=next(r for r in large['functions']if r['signature']=='private.v94_jsonb_object(jsonb)')
 assert helper['present']and helper['definition_too_large']and helper['definition']is None and len(helper['body_hash'])==32
 assert psql('-c',snapshot)==large_before
finally:
 psql('-c',"DROP FUNCTION IF EXISTS public.vendor_get_order_segment_details(text,uuid);DROP FUNCTION IF EXISTS private.v94_jsonb_object(jsonb);DROP FUNCTION IF EXISTS public.vendor_get_order_segment_details(text,text);")
assert psql('-c',snapshot)==before
print('PASS_INVOICE_CATALOG_CONTRACT: two exact signatures, absent/oversized markers, read-only, no legacy RPC invocation, no overload or customer-row data and fixture data/code unchanged')

# Exactly three notice contracts whose observed fingerprints did not match source.
# Missing/oversized definitions stay explicit; even raise-if-called stubs are never run.
notice_query=root/'sql/kinto-privacy-notice-contract-readonly-v1.sql'
notice_original=psql('-c',snapshot)
notice_signatures=[
 'public.admin_send_customer_notice_v414(text,uuid,text,text,text,text[],boolean)',
 'public.admin_send_customer_notice_v420(text,uuid,text,text,text,text[],boolean,text[])',
 'public.customer_read_admin_notice_v414(text,uuid)']
missing=json.loads(psql('-f',str(notice_query)))
assert missing['transaction_read_only']=='on' and len(missing['functions'])==3
assert all(not f['present']and f['definition']is None for f in missing['functions'])
try:
 for signature in notice_signatures:
  psql('-c',f"CREATE FUNCTION {signature}RETURNS jsonb LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'NOTICE_WRITER_MUST_NOT_BE_CALLED';END$$;")
 before=psql('-c',snapshot)
 notice=json.loads(psql('-f',str(notice_query)))
 assert {f['signature']for f in notice['functions']}==set(notice_signatures)
 assert all(f['present']and not f['definition_too_large']and 'NOTICE_WRITER_MUST_NOT_BE_CALLED'in f['definition']for f in notice['functions'])
 assert notice['application_functions_invoked']is False and notice['customer_or_order_rows_read']is False and notice['production_changes_authorized']is False
 assert psql('-c',snapshot)==before
 import tempfile
 with tempfile.TemporaryDirectory()as folder:
  large_sql=pathlib.Path(folder)/'oversized-notice-fixture.sql'
  large_sql.write_text(f"CREATE OR REPLACE FUNCTION {notice_signatures[0]}RETURNS jsonb LANGUAGE plpgsql AS $$BEGIN /*"+'x'*131100+"*/ RAISE EXCEPTION 'NOTICE_WRITER_MUST_NOT_BE_CALLED';END$$;")
  psql('-f',str(large_sql))
 before=psql('-c',snapshot)
 large=json.loads(psql('-f',str(notice_query)))
 oversized=next(f for f in large['functions']if f['signature']==notice_signatures[0])
 assert oversized['present']and oversized['definition_too_large']and oversized['definition']is None,'never return a truncated body as a complete contract'
 assert psql('-c',snapshot)==before
finally:
 for signature in notice_signatures:psql('-c','DROP FUNCTION IF EXISTS '+signature)
assert psql('-c',snapshot)==notice_original
print('PASS_NOTICE_CONTRACT_INSPECTION: three exact signatures, explicit missing/oversized flags, no writer execution or business reads, original fixture data/code unchanged')
