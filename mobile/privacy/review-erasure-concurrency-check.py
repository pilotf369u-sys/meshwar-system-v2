"""Competing real PG transactions, synthetic-only review and no Storage operations."""
import json,os,subprocess
if os.environ.get('KINTO_DISPOSABLE_TEST')!='1'or os.environ.get('PGHOST')!='127.0.0.1'or os.environ.get('PGDATABASE')!='kinto_privacy_test':raise SystemExit('DISPOSABLE_DATABASE_REQUIRED')
base=['psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1']
def run(sql,ok=True):
 p=subprocess.run(base,input=sql,text=True,capture_output=True,timeout=12)
 if ok and p.returncode:raise AssertionError(p.stderr)
 return p
cid='00000000-0000-4000-8000-000000000002';review='00000000-0000-4000-8000-000000000065'
request=json.loads(run("SELECT row_to_json(r)FROM private.kinto_deletion_requests_v1 r WHERE customer_id='%s';"%cid).stdout)
rid=request['id'];before=run('SELECT md5(jsonb_agg(to_jsonb(o)ORDER BY id)::text)FROM public.orders o;').stdout
last_event=int(run('SELECT coalesce(max(id),0)FROM private.kinto_privacy_events_v1;').stdout)
p=None
try:
 run("""UPDATE private.kinto_deletion_requests_v1 SET status='verified'WHERE id='%s';
 INSERT INTO public.product_reviews(id,customer_id,order_id,store_id,product_reference,product_name_snapshot,rating,comment)VALUES('%s','%s','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000010','TEST concurrent erasure','TEST isolated review',5,'TEST synthetic only');
 SELECT public.kinto_privacy_review_record_v1('test-admin','%s','approve_erase','%s',(SELECT private.kinto_privacy_review_hash_v1(to_jsonb(r))FROM public.product_reviews r WHERE id='%s'),'TEST nonfinancial review approved');"""%(rid,review,cid,rid,review,review))
 p=subprocess.Popen(base,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
 p.stdin.write("BEGIN;SELECT public.kinto_privacy_review_erase_v1('test-admin','%s','%s','%s');\n\\echo REVIEW_ERASE_LOCKED\nSELECT pg_sleep(1.5);COMMIT;\n"%(rid,review,review));p.stdin.close()
 for line in p.stdout:
  if line.strip()=='REVIEW_ERASE_LOCKED':break
 else:raise AssertionError('erasure transaction failed: '+p.stderr.read())
 report="INSERT INTO private.kinto_review_reports_v1(customer_id,review_id,kind,reason)VALUES('00000000-0000-4000-8000-000000000001','%s','user','other');"%review
 blocked=run("SET lock_timeout='200ms';"+report,False)
 assert blocked.returncode and 'lock timeout'in blocked.stderr,blocked.stderr
 p.wait(timeout=8);assert p.returncode==0,p.stderr.read()
 late=run(report,False)
 assert late.returncode and 'REVIEW_REPORT_TARGET_CHANGED'in late.stderr,late.stderr
 assert run("SELECT count(*)FROM private.kinto_review_reports_v1 WHERE review_id='%s';"%review).stdout.strip()=='0'
 assert run("SELECT count(*)FROM public.product_reviews WHERE id='%s';"%review).stdout.strip()=='0'
finally:
 if p and p.poll()is None:p.kill();p.wait(timeout=3)
 # Only fixed synthetic IDs/events from this test; not an operational cleanup command.
 run("DELETE FROM private.kinto_review_reports_v1 WHERE review_id='%s';DELETE FROM private.kinto_privacy_review_decisions_v1 WHERE request_id='%s'AND review_id='%s';DELETE FROM public.product_reviews WHERE id='%s';DELETE FROM private.kinto_privacy_events_v1 WHERE request_id='%s'AND id>%d AND event='reviewed_product_review_erased';UPDATE private.kinto_deletion_requests_v1 SET status='%s'WHERE id='%s';"%(review,rid,review,review,rid,last_event,request['status'],rid))
assert run('SELECT md5(jsonb_agg(to_jsonb(o)ORDER BY id)::text)FROM public.orders o;').stdout==before
print('PASS_REVIEW_REPORT_CONCURRENCY: erase transaction blocks competing report insertion; a late/stale report cannot attach to an erased review; fixture cleaned, orders unchanged')
