import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const modulePath=process.env.KINTO_PGLITE_MODULE;
const {PGlite}=await import(modulePath||'@electric-sql/pglite');
const {pgcrypto}=await import(modulePath?new URL('./contrib/pgcrypto.js',modulePath.startsWith('file:')?modulePath:pathToFileURL(modulePath)).href:'@electric-sql/pglite/contrib/pgcrypto');
const install=fs.readFileSync('sql/customer-password-v1/install.sql','utf8');
const rollback=fs.readFileSync('sql/customer-password-v1/rollback.sql','utf8');
const verify=fs.readFileSync('sql/customer-password-v1/verify.sql','utf8');
const proposal=fs.readFileSync('sql/kinto-customer-password-change-proposal-20261030.sql','utf8');
assert.equal(install.split('AS $$')[1].split('$$;')[0],proposal.split('AS $$')[1].split('$$;')[0]);
assert(!/CREATE OR REPLACE|CREATE TABLE IF NOT EXISTS|\bCASCADE\b/.test(install));
let checks=1;
async function fixture(){
 const db=new PGlite({extensions:{pgcrypto}});
 await db.exec(`CREATE SCHEMA private;CREATE SCHEMA extensions;CREATE EXTENSION pgcrypto;
 ALTER EXTENSION pgcrypto SET SCHEMA extensions;CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE synthetic_extra;
 REVOKE CREATE ON SCHEMA public,private,extensions FROM PUBLIC,anon,authenticated;
 GRANT USAGE ON SCHEMA public TO anon,authenticated;
 CREATE TABLE public.customers(id uuid PRIMARY KEY,name text,password text);
 ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
 CREATE TABLE public.customer_review_sessions(customer_id uuid,token_hash bytea,expires_at timestamptz,revoked_at timestamptz,last_seen_at timestamptz);
 INSERT INTO public.customers VALUES ('00000000-0000-0000-0000-000000000001','Synthetic A','old-synthetic-password'),('00000000-0000-0000-0000-000000000002','Synthetic B','other-synthetic-password');`);
 const defs=JSON.parse(fs.readFileSync('ci/fixtures/customer-profile-definitions-20261016.json','utf8'));
 await db.exec(defs.find(x=>x.proname==='require_customer_review_session').definition);
 return db;
}
async function snapshot(db){return (await db.query(`SELECT
 (SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM public.customers c) AS customers,
 (SELECT jsonb_agg(to_jsonb(s)) FROM public.customer_review_sessions s) AS sessions,
 (SELECT jsonb_agg(to_jsonb(c) ORDER BY oid) FROM pg_catalog.pg_class c WHERE c.oid IN ('public.customers'::regclass,'public.customer_review_sessions'::regclass)) AS catalog,
 (SELECT pg_get_functiondef('private.require_customer_review_session(text)'::regprocedure)) AS helper,
 (SELECT jsonb_agg(to_jsonb(n) ORDER BY oid) FROM pg_catalog.pg_namespace n WHERE n.nspname IN ('public','private','extensions')) AS schemas,
 (SELECT jsonb_agg(to_jsonb(d) ORDER BY oid) FROM pg_catalog.pg_default_acl d) AS defaults`)).rows[0];}
async function rejected(db,sql,pattern){await assert.rejects(()=>db.exec(sql),pattern);await db.exec('ROLLBACK');checks++;}
const db=await fixture();
try{
 // Supabase default ACLs may grant other roles rights; only NEW ACLs are cleaned.
 await db.exec(`ALTER DEFAULT PRIVILEGES IN SCHEMA private GRANT ALL ON TABLES TO synthetic_extra;
 ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO synthetic_extra;`);
 await db.exec(fs.readFileSync('sql/customer-password-v1/review-existing-boundaries.sql','utf8'));
 const before=await snapshot(db);
 await db.exec(install);await db.exec(verify);checks++;
 for(const [change,undo,error] of [
  ['GRANT EXECUTE ON FUNCTION public.customer_change_password_session_v1(text,text,text) TO PUBLIC','REVOKE EXECUTE ON FUNCTION public.customer_change_password_session_v1(text,text,text) FROM PUBLIC',/VERIFY_RPC_ACL/],
  ['GRANT SELECT ON private.customer_password_change_attempts_v1 TO anon','REVOKE SELECT ON private.customer_password_change_attempts_v1 FROM anon',/VERIFY_TABLE_ACL/],
  ['ALTER TABLE private.customer_password_change_attempts_v1 DISABLE ROW LEVEL SECURITY','ALTER TABLE private.customer_password_change_attempts_v1 ENABLE ROW LEVEL SECURITY',/VERIFY_TABLE_SECURITY/]
 ]){await db.exec(change);await rejected(db,verify,error);await db.exec(undo);await db.exec(verify);}
 assert.deepEqual(await snapshot(db),before);checks++;
 assert.equal((await db.query("SELECT has_function_privilege('synthetic_extra','public.customer_change_password_session_v1(text,text,text)','EXECUTE') allowed")).rows[0].allowed,false);checks++;
 await rejected(db,install,/INSTALL_OBJECT_ALREADY_EXISTS/);
 assert.deepEqual(await snapshot(db),before);checks++;
 for(const role of ['anon','authenticated']){
  await db.exec('SET ROLE '+role);
  await assert.rejects(()=>db.query('SELECT * FROM private.customer_password_change_attempts_v1'),/permission denied/);checks++;
  await assert.rejects(()=>db.query('INSERT INTO private.customer_password_change_attempts_v1(customer_id) VALUES(gen_random_uuid())'),/permission denied/);checks++;
  await assert.rejects(()=>db.query("SELECT public.customer_change_password_session_v1('invalid','old-synthetic-password','new-synthetic-password')"),/REVIEW_SESSION_INVALID/);checks++;
  await db.exec('RESET ROLE');
 }
 await db.exec("INSERT INTO private.customer_password_change_attempts_v1(customer_id,failed_attempts,locked_until) VALUES ('00000000-0000-0000-0000-000000000001',5,now()+interval '15 minutes')");
 const attempts=(await db.query('SELECT * FROM private.customer_password_change_attempts_v1')).rows;
 await db.exec(rollback);checks++;
 assert.deepEqual(await snapshot(db),before);checks++;
 assert.deepEqual((await db.query('SELECT * FROM private.customer_password_change_attempts_v1')).rows,attempts);checks++;
 assert.equal((await db.query("SELECT to_regprocedure('public.customer_change_password_session_v1(text,text,text)') rpc")).rows[0].rpc,null);checks++;
 await rejected(db,rollback,/ROLLBACK_IDENTITY_MISMATCH/);
 await rejected(db,install,/INSTALL_OBJECT_ALREADY_EXISTS/); // preserved counter table blocks accidental reinstall
}finally{await db.close();}
for(const [setup,error] of [
 ["CREATE FUNCTION public.customer_change_password_session_v1(text,text,text) RETURNS jsonb LANGUAGE sql AS 'SELECT null::jsonb'",/INSTALL_OBJECT_ALREADY_EXISTS/],
 ["CREATE TABLE private.customer_password_change_attempts_v1(sentinel text); INSERT INTO private.customer_password_change_attempts_v1 VALUES('keep')",/INSTALL_OBJECT_ALREADY_EXISTS/],
 ["CREATE FUNCTION public.customer_change_password_session_v1(integer) RETURNS integer LANGUAGE sql AS 'SELECT $1'",/INSTALL_OBJECT_ALREADY_EXISTS/],
 ['GRANT CREATE ON SCHEMA public TO anon',/INSTALL_UNTRUSTED_SCHEMA_CREATE/],
 ['GRANT CREATE ON SCHEMA extensions TO PUBLIC',/INSTALL_UNTRUSTED_SCHEMA_CREATE|INSTALL_PUBLIC_SCHEMA_CREATE/],
 ['REVOKE USAGE ON SCHEMA public FROM PUBLIC,anon,authenticated',/INSTALL_PUBLIC_USAGE_MISSING/],
 ['ALTER TABLE public.customers DISABLE ROW LEVEL SECURITY',/INSTALL_DEPENDENCY_MISMATCH/],
 ['ALTER FUNCTION private.require_customer_review_session(text) OWNER TO synthetic_extra',/INSTALL_DEPENDENCY_MISMATCH/]
]){
 const db=await fixture();try{
  await db.exec(setup);const before=await snapshot(db);
  const existing=(await db.query("SELECT to_regclass('private.customer_password_change_attempts_v1')::text object")).rows;
  await rejected(db,install,error);assert.deepEqual(await snapshot(db),before);checks++;
  assert.deepEqual((await db.query("SELECT to_regclass('private.customer_password_change_attempts_v1')::text object")).rows,existing);checks++;
 }finally{await db.close();}
}
const atomic=await fixture();try{
 const before=await snapshot(atomic);
 await rejected(atomic,install.replace('COMMIT;','SELECT 1/0; COMMIT;'),/division by zero/);
 assert.deepEqual(await snapshot(atomic),before);checks++;
 assert.equal((await atomic.query("SELECT to_regclass('private.customer_password_change_attempts_v1') t, to_regprocedure('public.customer_change_password_session_v1(text,text,text)') f")).rows[0].t,null);checks++;
 await atomic.exec('SET ROLE anon');await rejected(atomic,install,/INSTALL_REQUIRES_POSTGRES/);await atomic.exec('RESET ROLE');
 await atomic.exec(install);
 await atomic.exec("CREATE VIEW public.synthetic_password_dependency AS SELECT public.customer_change_password_session_v1('invalid','synthetic-current','synthetic-next') AS result");
 await rejected(atomic,rollback,/depend/);
 assert.notEqual((await atomic.query("SELECT to_regprocedure('public.customer_change_password_session_v1(text,text,text)') f")).rows[0].f,null);checks++;
 assert.deepEqual(await snapshot(atomic),before);checks++;
}finally{await atomic.close();}
const tampered=await fixture();try{
 await tampered.exec(install);
 await tampered.exec("COMMENT ON FUNCTION public.customer_change_password_session_v1(text,text,text) IS 'other package'");
 await rejected(tampered,rollback,/ROLLBACK_IDENTITY_MISMATCH/);
 await assert.rejects(()=>tampered.exec(verify),/VERIFY_RPC_SECURITY/);await tampered.exec('ROLLBACK');checks++;
}finally{await tampered.close();}
console.log('Password installer/verification/rollback isolated checks passed:',checks);
