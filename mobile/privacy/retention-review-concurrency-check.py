"""Real competing transactions on fixed synthetic records; no production or eraser."""
import json,os,subprocess
if os.environ.get('KINTO_DISPOSABLE_TEST')!='1'or os.environ.get('PGHOST')!='127.0.0.1'or os.environ.get('PGDATABASE')!='kinto_privacy_test':raise SystemExit('DISPOSABLE_DATABASE_REQUIRED')
base=['psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1']
def run(sql,ok=True):
 p=subprocess.run(base,input=sql,text=True,capture_output=True,timeout=12)
 if ok and p.returncode:raise AssertionError(p.stderr)
 return p
cid='00000000-0000-4000-8000-000000000142';rid='00000000-0000-4000-8000-000000000141';oid='00000000-0000-4000-8000-000000000143'
before=run('SELECT md5(jsonb_agg(to_jsonb(o)ORDER BY id)::text)FROM public.orders o;').stdout
p=None
try:
 run(f"INSERT INTO public.customers(id,name,phone,code)VALUES('{cid}','TEST retention concurrency','TEST-142','TEST-RETENTION-CONC');INSERT INTO public.orders(id,customer_id,status,details)VALUES('{oid}','{cid}','TEST',jsonb_build_object('amount',123));INSERT INTO private.kinto_deletion_requests_v1(id,customer_id,status,verified_by)VALUES('{rid}','{cid}','verified','00000000-0000-4000-8000-000000000099');")
 row=json.loads(run(f"SELECT public.kinto_privacy_retention_review_v1('test-admin','{rid}')->'items'->0;").stdout)
 call=f"SELECT public.kinto_privacy_retention_review_v1('test-admin','{rid}','orders','retain','{oid}',NULL,'{row['content_hash']}','{row['inventory_signature']}',0,'accounting',ARRAY['reference','amount_currency'],now()+interval '7 days');"
 p=subprocess.Popen(base,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
 p.stdin.write('BEGIN;'+call+'\n\\echo RETENTION_RECORD_LOCKED\nSELECT pg_sleep(1.5);COMMIT;\n');p.stdin.close()
 for line in p.stdout:
  if line.strip()=='RETENTION_RECORD_LOCKED':break
 else:raise AssertionError('retention transaction failed: '+p.stderr.read())
 change=f"UPDATE public.orders SET details=jsonb_build_object('amount',456)WHERE id='{oid}';"
 blocked=run("SET lock_timeout='200ms';"+change,False)
 assert blocked.returncode and 'lock timeout'in blocked.stderr,blocked.stderr
 p.wait(timeout=8);assert p.returncode==0,p.stderr.read()
 run(change)
 updated=json.loads(run(f"SELECT public.kinto_privacy_retention_review_v1('test-admin','{rid}')->'items'->0;").stdout)
 assert updated['decision_current']is False,'normal later business update must invalidate prior retention review'
 assert run(f"SELECT details->>'amount'FROM public.orders WHERE id='{oid}';").stdout.strip()=='456','privacy review does not undo a later valid business write'
 assert run(f"SELECT count(*)FROM private.kinto_erasure_ledger_v1 WHERE request_id='{rid}';").stdout.strip()=='0','retention creates no completed erasure evidence'
finally:
 if p and p.poll()is None:p.kill();p.wait(timeout=3)
 run(f"DELETE FROM private.kinto_privacy_retention_decisions_v1 WHERE request_id='{rid}';DELETE FROM private.kinto_privacy_events_v1 WHERE request_id='{rid}';DELETE FROM private.kinto_deletion_requests_v1 WHERE id='{rid}';DELETE FROM public.orders WHERE id='{oid}';DELETE FROM public.customers WHERE id='{cid}';")
assert run('SELECT md5(jsonb_agg(to_jsonb(o)ORDER BY id)::text)FROM public.orders o;').stdout==before
print('PASS_TRANSACTION_RETENTION_CONCURRENCY: review locks current record until commit; independent later amount update succeeds and invalidates the review; synthetic fixture cleaned and original orders unchanged')
