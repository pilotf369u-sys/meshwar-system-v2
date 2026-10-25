"""Actual competing PostgreSQL transactions, disposable fixture only; no Storage/network calls."""
import json,os,subprocess
if os.environ.get('KINTO_DISPOSABLE_TEST')!='1' or os.environ.get('PGHOST')!='127.0.0.1' or os.environ.get('PGDATABASE')!='kinto_privacy_test':
 raise SystemExit('DISPOSABLE_DATABASE_REQUIRED')
base=['psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1']
def run(sql,ok=True):
 p=subprocess.run(base,input=sql,text=True,capture_output=True,timeout=12)
 if ok and p.returncode:raise AssertionError(p.stderr)
 return p
cid='00000000-0000-4000-8000-000000000002';image='00000000-0000-4000-8000-000000000064'
request=json.loads(run("SELECT row_to_json(r)FROM private.kinto_deletion_requests_v1 r WHERE customer_id='%s';"%cid).stdout)
request_id=request['id'];before=run("SELECT md5(jsonb_agg(to_jsonb(o)ORDER BY id)::text)FROM public.orders o;").stdout
assert run('SELECT count(*)FROM private.kinto_privacy_media_jobs_v1;').stdout.strip()=='0'
assert run('SELECT count(*)FROM private.kinto_privacy_media_policy_v1;').stdout.strip()=='0'
p=None
try:
 run("""UPDATE private.kinto_deletion_requests_v1 SET status='verified' WHERE id='%s';
 INSERT INTO public.product_review_images(id,review_id,storage_path,mime_type,byte_size,sort_order)
 SELECT '%s',id,'reviews/'||id||'/concurrency-only.png','image/png',12,0 FROM public.product_reviews WHERE customer_id='%s';
 INSERT INTO private.kinto_privacy_media_policy_v1 VALUES(true,true,private.kinto_erasure_signature_v1());
 SELECT public.kinto_privacy_media_prepare_v1('test-admin','%s','%s');"""%(request_id,image,cid,request_id,request_id))
 p=subprocess.Popen(base,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
 # Keep the successful claim transaction open while a competing writer tries the source row.
 p.stdin.write("BEGIN; SELECT public.kinto_privacy_media_claim_v1('test-admin','%s');\n\\echo CLAIM_LOCKED\nSELECT pg_sleep(1.5); COMMIT;\n"%request_id);p.stdin.close()
 for line in p.stdout:
  if line.strip()=='CLAIM_LOCKED':break
 else:raise AssertionError('claim did not acquire lease: '+p.stderr.read())
 blocked=run("SET lock_timeout='200ms'; UPDATE public.product_review_images SET storage_path='wrong.png'WHERE id='%s';"%image,False)
 assert blocked.returncode and 'lock timeout' in blocked.stderr,blocked.stderr
 p.wait(timeout=8);assert p.returncode==0,p.stderr.read()
 blocked=run("UPDATE public.product_review_images SET storage_path='wrong.png'WHERE id='%s';"%image,False)
 assert blocked.returncode and 'PRIVACY_MEDIA_IN_PROGRESS'in blocked.stderr,blocked.stderr
 idle=json.loads(run("SELECT public.kinto_privacy_media_claim_v1('test-admin','%s');"%request_id).stdout)
 assert idle.get('idle')is True,'second worker duplicated an active lease'
 assert run("SELECT storage_path LIKE '%%/concurrency-only.png'FROM public.product_review_images WHERE id='%s';"%image).stdout.strip()=='t'
finally:
 if p and p.poll()is None:p.kill();p.wait(timeout=3)
 # Operator cleanup of synthetic fixtures only. No deleted object has to be restored.
 run("DELETE FROM private.kinto_privacy_media_jobs_v1 WHERE request_id='%s';DELETE FROM public.product_review_images WHERE id='%s';DELETE FROM private.kinto_privacy_media_policy_v1;UPDATE private.kinto_deletion_requests_v1 SET status='%s'WHERE id='%s';"%(request_id,image,request['status'],request_id))
assert run("SELECT md5(jsonb_agg(to_jsonb(o)ORDER BY id)::text)FROM public.orders o;").stdout==before
print('PASS_PRIVACY_MEDIA_CONCURRENCY: live claim blocks competing source mutation; committed lease protects identity; second worker cannot double-claim; fixture cleaned and orders unchanged')
