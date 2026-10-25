"""Local CI-only RPC bridge. Never deploy. Refuses non-disposable/non-loopback DB."""
import http.server,json,os,pathlib,re,subprocess
if os.environ.get('KINTO_DISPOSABLE_TEST')!='1' or os.environ.get('PGHOST')!='127.0.0.1' or os.environ.get('PGDATABASE')!='kinto_privacy_test':raise SystemExit('DISPOSABLE_DATABASE_REQUIRED')
ROOT=pathlib.Path(__file__).resolve().parents[2]
ALLOWED={'kinto_review_consent_v1','kinto_review_submit_v1','kinto_review_safety_v1','kinto_reviews_visible_v1','kinto_deletion_request_v1','kinto_privacy_admin_v1','kinto_deletion_preflight_v1','product_reviews_public_v141','product_review_summaries_v140'}
def literal(x):
 if x is None:return 'NULL'
 if isinstance(x,bool):return 'true'if x else 'false'
 if isinstance(x,int):return str(x)
 if isinstance(x,list):return 'ARRAY['+','.join(literal(y)for y in x)+']::uuid[]'
 return "'"+str(x).replace("'","''")+"'"
def query(sql):
 r=subprocess.run(['psql','-X','-A','-t','-v','ON_ERROR_STOP=1','-c',sql],capture_output=True,text=True,timeout=15)
 if r.returncode:raise ValueError(r.stderr)
 return r.stdout.strip().splitlines()[-1]
class Handler(http.server.SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw):super().__init__(*a,directory=str(ROOT),**kw)
 def log_message(self,*a):pass
 def do_POST(self):
  try:
   args=json.loads(self.rfile.read(int(self.headers.get('Content-Length','0'))))
   if self.path=='/__seed':
    subprocess.run(['psql','-v','ON_ERROR_STOP=1','-f',str(ROOT/'mobile/privacy/browser-seed.sql')],check=True,capture_output=True);result={'ok':True}
   elif self.path=='/__publish':query("UPDATE public.product_reviews SET moderation_status='published';SELECT '{}'::jsonb");result={'ok':True}
   else:
    name=self.path.rsplit('/',1)[-1]
    if name=='customer_review_ready_products_v132':result={'items':[{'order_id':'00000000-0000-4000-8000-000000000030','product_id':'00000000-0000-4000-8000-000000000020','product_name':'TEST delivered product','ready_for_review':True}]}
    elif name in ['customer_review_display_context_v154','customer_review_moderation_notices_v155','customer_review_rejection_notices_v153','customer_notification_read_state_v155']:result={'items':[]}
    else:
     if name not in ALLOWED or any(not re.fullmatch('p_[a-z_]+',k)for k in args):raise ValueError('RPC_NOT_ALLOWED')
     named=','.join('"'+k+'"=>'+(literal(v)+'::smallint'if k=='p_rating'else literal(v))for k,v in args.items())
     result=json.loads(query('SET ROLE anon;SELECT public."'+name+'"('+named+')'))
   self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(result).encode())
  except Exception as e:
   self.send_response(400);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps({'message':str(e)}).encode())
http.server.ThreadingHTTPServer(('127.0.0.1',8767),Handler).serve_forever()
