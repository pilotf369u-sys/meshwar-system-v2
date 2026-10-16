import fs from 'node:fs';
let db;
if(process.env.KINTO_TEST_DATABASE_URL){
 const pg=await import(process.env.KINTO_PG_MODULE || 'pg');
 const Client=pg.Client || pg.default.Client;
 const client=new Client({connectionString:process.env.KINTO_TEST_DATABASE_URL});await client.connect();
 db={exec:sql=>client.query(sql),query:(sql,args)=>client.query(sql,args),close:()=>client.end()};
 await db.exec('CREATE EXTENSION pgcrypto');
}else{const {PGlite}=await import(process.env.KINTO_PGLITE_MODULE || '@electric-sql/pglite');db=new PGlite();
 await db.exec("create function public.digest(text,text) returns bytea language sql as $$select sha256(convert_to($1,'UTF8'))$$;");}

await db.exec(`create role anon;create role authenticated;create schema private; create schema extensions;
create table employees(id uuid primary key,role text,is_active boolean);
create table customers(id uuid primary key,reward_balances jsonb,rewards_log jsonb);
create table local_stores(id uuid primary key,store_name text,is_active boolean);
create table admin_sessions_v147(admin_id text,token_hash bytea,expires_at timestamptz,revoked_at timestamptz,last_seen_at timestamptz);
create table employee_sessions_v143(employee_id text,token_hash bytea,expires_at timestamptz,revoked_at timestamptz,last_seen_at timestamptz);
create table merchant_featured_requests(id uuid primary key,merchant_id uuid,slot_type varchar,banner_url text,store_logo text,store_name varchar,item_ids uuid[],requested_start_date timestamptz,requested_end_date timestamptz,status varchar,admin_note text,approved_slot_id uuid,created_at timestamptz,store_id uuid,reviewed_by uuid,reviewed_at timestamptz,updated_at timestamptz);
create table merchant_featured_slots(id uuid primary key default gen_random_uuid(),merchant_id uuid,slot_type varchar,banner_url text,store_logo text,store_name varchar,item_ids uuid[],start_date timestamptz,end_date timestamptz,is_active boolean,created_at timestamptz default now(),store_id uuid);`);
for(const x of JSON.parse(fs.readFileSync(new URL('./fixtures/sensitive-rpc-definitions-20261016.json',import.meta.url))))await db.exec(x.definition);
await db.exec(fs.readFileSync('sql/kinto-session-verified-sensitive-rpcs-v1.sql','utf8'));
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
for(const [n,role,active] of [[1,'admin',true],[2,'employee',true],[3,'vendor',true],[4,'employee',false],[5,null,true]]){
 await db.query('insert into employees values($1,$2,$3)',[id(n),role,active]);
 for(const table of ['admin','employee'])await db.query(`insert into ${table}_sessions_v${table==='admin'?'147':'143'} values($1,digest($2,'sha256'),now()+interval '1 day',null,null)`,[id(n),`${table}-${n}`]);
}
await db.exec(`insert into customers values('${id(10)}','{"USD":100}','[]');insert into local_stores values('${id(20)}','Test',true);insert into merchant_featured_requests(id,status,store_id,slot_type) values('${id(30)}','pending','${id(20)}','hero_banner'),('${id(31)}','pending','${id(20)}','hero_banner');`);
let apiRole='anon';let count=0;async function call(fn,args){return db.query(`select * from public.${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args)}
async function deny(fn,args,pattern){await db.exec('set role '+apiRole);try{await call(fn,args);throw Error('UNEXPECTED SUCCESS '+fn)}catch(e){if(!pattern.test(e.message))throw e;count++;}finally{await db.exec('reset role')}}
const cases=[['admin_list_featured_requests_session_v1',[]],['list_featured_merchants_session_v1',[]],['admin_approve_featured_request_session_v1',[id(30),id(20),'2026-10-16','2026-10-20',null]],['admin_reject_featured_request_session_v1',[id(31),null]],['adjust_customer_reward_balance_admin_session_v1',[id(10),1,'USD',null]],['adjust_customer_reward_balance_employee_session_v1',[id(10),1,'USD',null]]];
for(const [fn,args] of cases){for(const token of [null,'','invalid'])await deny(fn,[token,...args],/SESSION_(REQUIRED|INVALID)/);const employee=fn.includes('_employee_');await deny(fn,[employee?'admin-1':'employee-2',...args],/SESSION_INVALID/);}
await deny('adjust_customer_reward_balance_employee_session_v1',['employee-4',id(10),1,'USD',null],/EMPLOYEE_INACTIVE/);
await deny('adjust_customer_reward_balance_employee_session_v1',['employee-3',id(10),1,'USD',null],/REWARD_ACTOR_NOT_AUTHORIZED/);
await deny('adjust_customer_reward_balance_employee_session_v1',['employee-5',id(10),1,'USD',null],/REWARD_ACTOR_NOT_AUTHORIZED/);
await deny('admin_list_featured_requests_session_v1',['admin-2'],/ADMIN_ROLE_REQUIRED/);
for(const [table,version] of [['admin',147],['employee',143]]){await db.exec(`insert into ${table}_sessions_v${version} values('${id(table==='admin'?1:2)}',digest('${table}-expired','sha256'),now()-interval '1 day',null,null),('${id(table==='admin'?1:2)}',digest('${table}-revoked','sha256'),now()+interval '1 day',now(),null)`);for(const suffix of ['expired','revoked'])await deny(table==='admin'?cases[0][0]:cases[5][0],[`${table}-${suffix}`,...(table==='admin'?[]:cases[5][1])],/SESSION_INVALID/);}
await db.exec(fs.readFileSync('sql/kinto-sensitive-legacy-rpc-lockdown-v1.sql','utf8'));
for(const [fn,args] of cases){await db.exec('set role anon');await call(fn,[fn.includes('_employee_')?'employee-2':'admin-1',...args]);await db.exec('reset role');count++;}
const balance=(await db.query('select reward_balances from customers')).rows[0].reward_balances.USD;if(balance!==102)throw Error('balance mismatch');
const reviewed=(await db.query('select reviewed_by from merchant_featured_requests')).rows;if(reviewed.some(x=>x.reviewed_by!==id(1)))throw Error('actor mismatch');
await deny('adjust_customer_reward_balance',[id(10),1,'USD',id(2),null],/permission denied/);
await deny('admin_approve_featured_request',[id(1),id(30),id(20),'2026-10-16','2026-10-20',null],/permission denied/);
for(const role of ['anon','authenticated']){
 apiRole=role;
 for(const [fn,args] of cases)await deny(fn,['invalid',...args],/SESSION_INVALID/);
 for(const [fn,args] of [
 ['adjust_customer_reward_balance',[id(10),1,'USD',id(2),null]],
 ['admin_list_featured_requests',[id(1)]],['list_featured_merchants',[id(1)]],
 ['admin_reject_featured_request',[id(1),id(31),null]],
 ['admin_approve_featured_request',[id(1),id(30),id(20),'2026-10-16','2026-10-20',null]]
 ])await deny(fn,args,/permission denied/);
 await db.exec('set role '+role);await call('admin_list_featured_requests_session_v1',['admin-1']);await db.exec('reset role');count++;
}
const {verifyDatabaseUi}=await import('./sensitive-session-db-ui.mjs');await verifyDatabaseUi(db,id);
console.log(`PASS ${count} isolated PostgreSQL authorization cases; correct balances and server-derived audit actors; wrappers succeed after legacy revocation`);if(process.env.KINTO_TEST_DATABASE_URL){const {verifyRealLogin}=await import('./sensitive-session-login.mjs');await verifyRealLogin(db,id,verifyDatabaseUi);}
await db.close();
