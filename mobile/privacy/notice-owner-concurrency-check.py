"""Two real PostgreSQL sessions, synthetic fixture only; not a full account eraser."""
import os,subprocess,pathlib,json
if os.environ.get('KINTO_DISPOSABLE_TEST')!='1' or os.environ.get('PGHOST')!='127.0.0.1' or os.environ.get('PGDATABASE')!='kinto_privacy_test':
 raise SystemExit('DISPOSABLE_DATABASE_REQUIRED')
base=['psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1']
def run(sql,ok=True):
 p=subprocess.run(base,input=sql,text=True,capture_output=True,timeout=15)
 if ok and p.returncode:raise AssertionError(p.stderr)
 return p
cid='00000000-0000-4000-8000-000000000191';other='00000000-0000-4000-8000-000000000192';notice='00000000-0000-4000-8000-000000000193'
assert run("SELECT to_regclass('public.kinto_customer_admin_notice_recipients')IS NULL;").stdout.strip()=='t','dedicated fixture table must be absent'
before=run('SELECT md5(jsonb_agg(to_jsonb(o)ORDER BY id)::text)FROM public.orders o;').stdout
saved_policy=run("SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) FROM private.kinto_erasure_policy_v1 p;").stdout.strip()
request='00000000-0000-4000-8000-000000000194'
active=[]
def start(sql,marker):
 p=subprocess.Popen(base,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1);active.append(p)
 p.stdin.write(sql+'\n\\echo '+marker+'\nSELECT pg_sleep(1.5);COMMIT;\n');p.stdin.close()
 for line in p.stdout:
  if line.strip()==marker:return p
 raise AssertionError(p.stderr.read())
def finish(p):
 p.wait(timeout=8);assert p.returncode==0,p.stderr.read()
try:
 run(f"CREATE TABLE public.kinto_customer_admin_notices(id uuid PRIMARY KEY,body text);CREATE TABLE public.kinto_customer_admin_notice_recipients(notice_id uuid NOT NULL REFERENCES public.kinto_customer_admin_notices(id),customer_id text NOT NULL,read_at timestamptz,PRIMARY KEY(notice_id,customer_id));INSERT INTO public.customers(id,name,phone,code)VALUES('{cid}','TEST notice owner','TEST-191','TEST-NOTICE-191'),('{other}','TEST other owner','TEST-192','TEST-NOTICE-192');INSERT INTO public.kinto_customer_admin_notices VALUES('{notice}','TEST SHARED');INSERT INTO public.kinto_customer_admin_notice_recipients VALUES('{notice}','{other}',NULL);")
 run(pathlib.Path('sql/kinto-privacy-notice-owner-guard-v1.sql').read_text())
 run(pathlib.Path('sql/kinto-privacy-notice-cleanup-v1.sql').read_text())
 run(f"INSERT INTO private.kinto_deletion_requests_v1(id,customer_id,status,verified_by)VALUES('{request}','{cid}','verified','00000000-0000-4000-8000-000000000099');DELETE FROM private.kinto_erasure_policy_v1;INSERT INTO private.kinto_erasure_policy_v1(singleton,enabled,inventory_signature,policy_url,retention_notice)VALUES(true,true,private.kinto_erasure_signature_v1(),'https://shopkinto.com/SYNTHETIC-ONLY','SYNTHETIC disposal policy for isolated fixture only');")
 insert=f"INSERT INTO public.kinto_customer_admin_notice_recipients VALUES('{notice}','{cid}',NULL);"
 sender=start('BEGIN;'+insert,'SENDER_PINNED')
 blocked=run(f"SET lock_timeout='200ms';SELECT 1 FROM public.customers WHERE id='{cid}'FOR UPDATE;",False)
 assert blocked.returncode and 'lock timeout' in blocked.stderr,blocked.stderr
 finish(sender)
 # Use row locks only: an exclusive recipient-table lock would invert the writer's lock order.
 eraser=start(f"BEGIN;SELECT private.kinto_privacy_notice_cleanup_v1('{request}','{cid}');DELETE FROM public.customers WHERE id='{cid}';",'CUSTOMER_DELETED_UNCOMMITTED')
 blocked=run("SET lock_timeout='200ms';"+insert,False)
 assert blocked.returncode and 'lock timeout'in blocked.stderr,blocked.stderr
 finish(eraser)
 late=run(insert,False);assert late.returncode and 'NOTICE_CUSTOMER_NOT_AVAILABLE'in late.stderr,late.stderr
 assert run(f"SELECT count(*)FROM public.kinto_customer_admin_notice_recipients WHERE customer_id='{cid}';").stdout.strip()=='0'
 assert run(f"SELECT count(*)FROM public.kinto_customer_admin_notice_recipients WHERE customer_id='{other}';").stdout.strip()=='1'
 assert run('SELECT body FROM public.kinto_customer_admin_notices;').stdout.strip()=='TEST SHARED'
finally:
 for p in active:
  if p.poll()is None:p.kill();p.wait(timeout=3)
 run(pathlib.Path('sql/kinto-privacy-notice-cleanup-v1-rollback.sql').read_text())
 run(pathlib.Path('sql/kinto-privacy-notice-owner-guard-v1-rollback.sql').read_text())
 encoded=saved_policy.replace("'","''")
 run(f"DELETE FROM private.kinto_deletion_requests_v1 WHERE id='{request}';DELETE FROM private.kinto_erasure_policy_v1;INSERT INTO private.kinto_erasure_policy_v1 SELECT *FROM jsonb_populate_recordset(NULL::private.kinto_erasure_policy_v1,'{encoded}'::jsonb);")
 run(f"DROP TABLE public.kinto_customer_admin_notice_recipients;DROP TABLE public.kinto_customer_admin_notices;DELETE FROM public.customers WHERE id IN('{cid}','{other}');")
assert run('SELECT md5(jsonb_agg(to_jsonb(o)ORDER BY id)::text)FROM public.orders o;').stdout==before
print('PASS_NOTICE_OWNER_CONCURRENCY: sender pins customer; erasure blocks concurrent insert; late insert rejected; shared notice, other recipient, original orders preserved. Not full erasure qualification.')
