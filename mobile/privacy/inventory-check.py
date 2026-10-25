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
