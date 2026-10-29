import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const modulePath=process.env.KINTO_PGLITE_MODULE;
const {PGlite}=await import(modulePath||'@electric-sql/pglite');
const {pgcrypto}=await import(modulePath?new URL('./contrib/pgcrypto.js',modulePath.startsWith('file:')?modulePath:pathToFileURL(modulePath)).href:'@electric-sql/pglite/contrib/pgcrypto');
const db=new PGlite({extensions:{pgcrypto}});
let checks=0;
try{
 await db.exec("CREATE SCHEMA private;CREATE SCHEMA extensions;CREATE EXTENSION pgcrypto;ALTER EXTENSION pgcrypto SET SCHEMA extensions;CREATE ROLE anon;CREATE ROLE authenticated;SET search_path=public,extensions,pg_catalog;");
 await db.exec(`CREATE TABLE public.customers(id uuid PRIMARY KEY,name text,phone text,password text,email text,code text,country text,state text,address text,secondary_phone text);
 CREATE TABLE public.customer_review_sessions(customer_id uuid,token_hash bytea,expires_at timestamptz,revoked_at timestamptz,last_seen_at timestamptz);
 CREATE TABLE public.customer_review_login_attempts(identity_hash bytea,attempted_at timestamptz DEFAULT now());
 GRANT SELECT,INSERT,UPDATE ON public.customer_review_sessions TO anon,authenticated;`);
 const defs=JSON.parse(fs.readFileSync('ci/fixtures/customer-profile-definitions-20261016.json','utf8'));
 for(const x of defs)await db.exec(x.definition);
 await db.exec(fs.readFileSync('sql/kinto-customer-password-change-proposal-20261030.sql','utf8'));
 const id1='00000000-0000-0000-0000-000000000001',id2='00000000-0000-0000-0000-000000000002';
 await db.query("INSERT INTO public.customers(id,name,phone,password) VALUES($1,'One','user-one','legacy-old-password'),($2,'Two','user-two','other-old-password')",[id1,id2]);
 async function login(identity,password){return (await db.query('SELECT public.customer_review_login_v132($1,$2) result',[identity,password])).rows[0].result}
 async function change(token,oldPass,newPass,role='anon'){
   await db.exec('SET ROLE '+role);
   try{return (await db.query('SELECT public.customer_change_password_session_v1($1,$2,$3) result',[token,oldPass,newPass])).rows[0].result}
   finally{await db.exec('RESET ROLE')}
 }
 const first=await login('user-one','legacy-old-password');
 assert.equal(first.ok,true,JSON.stringify(first));checks++;
 const token=first.session_token;
 await assert.rejects(()=>change('invalid','legacy-old-password','strong-new-password-1'),/SESSION_(INVALID|REQUIRED)/);checks++;
 for(let i=0;i<4;i++){const r=await change(token,'wrong-old-password','strong-new-password-1');assert.equal(r.ok,false);checks++;}
 const fifth=await change(token,'wrong-old-password','strong-new-password-1');
 assert.equal(fifth.ok,false);checks++;
 const locked=await change(token,'legacy-old-password','strong-new-password-1');
 assert.equal(locked.error,'PASSWORD_CHANGE_TEMPORARILY_LOCKED');checks++;
 let old=(await db.query('SELECT password FROM public.customers WHERE id=$1',[id1])).rows[0].password;
 assert.equal(old,'legacy-old-password');checks++;
 await db.query("UPDATE private.customer_password_change_attempts_v1 SET locked_until=now()-interval '1 second',window_start=now()-interval '16 minutes' WHERE customer_id=$1",[id1]);
 const changed=await change(token,'legacy-old-password','strong-new-password-1','authenticated');
 assert.equal(changed.ok,true,JSON.stringify(changed));checks++;
 const hashed=(await db.query('SELECT password FROM public.customers WHERE id=$1',[id1])).rows[0].password;
 assert(hashed.startsWith('$2'));assert.notEqual(hashed,'strong-new-password-1');checks++;
 assert.equal((await login('user-one','strong-new-password-1')).ok,true);checks++;
 const other=(await db.query('SELECT password FROM public.customers WHERE id=$1',[id2])).rows[0].password;
 assert.equal(other,'other-old-password');checks++;
 assert.equal((await change(token,'legacy-old-password','another-strong-new-password')).ok,false);checks++;
 for(const value of [null,'','short']){const invalid=await change(token,'strong-new-password-1',value);assert.equal(invalid.error,'PASSWORD_INPUT_INVALID');checks++;}
 const missingCurrent=await change(token,null,'another-strong-new-password');assert.equal(missingCurrent.error,'PASSWORD_INPUT_INVALID');checks++;
 const same=await change(token,'strong-new-password-1','strong-new-password-1');
 assert.equal(same.error,'PASSWORD_INPUT_INVALID');checks++;
 console.log('Customer password isolated PostgreSQL checks passed:',checks);
}finally{await db.close();}
