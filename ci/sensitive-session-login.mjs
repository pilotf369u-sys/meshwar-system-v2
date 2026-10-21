import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {randomBytes} from 'node:crypto';
export async function verifyRealLogin(db,id,verifyDatabaseUi){
 await db.exec(`alter table employees add column code text,add column password text;
 create table admin_login_attempts_v147(identity_hash bytea,attempted_at timestamptz default now());
 create table employee_login_attempts_v143(identity_hash bytea,attempted_at timestamptz default now());`);
 for(const row of JSON.parse(fs.readFileSync(new URL('./fixtures/sensitive-rpc-login-definitions-20261016.json',import.meta.url))))await db.exec(row.definition);
 const password=randomBytes(24).toString('hex');
 for(const [n,code] of [[1,'isolated-admin'],[2,'isolated-employee']])await db.query("update employees set code=$1,password=crypt($2,gen_salt('bf')) where id=$3",[code,password,id(n)]);
 // Real frontend session helpers call real database login/identity/logout RPCs.
 const sb={rpc:async(name,args)=>{await db.exec('set role anon');try{const response=await db.query(`select public.${name}(${Object.keys(args).map((_,i)=>'$'+(i+1)).join(',')}) as result`,Object.values(args));return {data:response.rows[0].result}}catch(error){return {error}}finally{await db.exec('reset role')}}};
 const contexts=[];
 for(const [role,version,n] of [['admin',147,1],['employee',143,2]]){
  const storage=new Map();const context={window:{document:{documentElement:{classList:{remove:()=>{}}}}},sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},console};vm.createContext(context);vm.runInContext(fs.readFileSync(`js/${role}-session-v${version}.js`,'utf8'),context);
  const helper=context.window[role==='admin'?'KintoAdminSessionV147':'KintoEmployeeSessionV143'];
  const bad=await helper.login(sb,'isolated-'+role,'wrong-password');assert.equal(bad.ok,false);assert.equal(helper.read(),null);
  const good=await helper.login(sb,'isolated-'+role,password);assert.equal(good.ok,true);const session=helper.read();assert(/^[a-f0-9]{64}$/.test(session.token));assert.equal((await helper.identity(sb)).id,id(n));
  const record=(await db.query(`select encode(token_hash,'hex') as hash,expires_at>now() as valid from ${role}_sessions_v${version} where token_hash=digest($1,'sha256')`,[session.token])).rows;
  assert.equal(record.length,1);assert.equal(record[0].valid,true);assert.equal(record[0].hash===session.token,false);
  const adjustment=await sb.rpc(`adjust_customer_reward_balance_${role}_session_v1`,{p_session_token:session.token,p_customer_id:id(10),p_amount:2,p_currency:'USD',p_note:'isolated real-login test'});assert.equal(Boolean(adjustment.error),false);
  contexts.push({role,version,helper,session});
 }
 assert.equal((await db.query('select reward_balances from customers where id=$1',[id(10)])).rows[0].reward_balances.USD,106);
 // Obtain a second genuine admin session, then revoke it via the real logout RPC.
 const second=await sb.rpc('admin_login_v147',{p_identity:'isolated-admin',p_password:password});assert.equal(second.data.ok,true);
 const revoked=second.data.session_token;assert.equal((await sb.rpc('admin_logout_v147',{p_session_token:revoked})).data,true);
 await verifyDatabaseUi(db,n=>id(n>=32&&n<=34?n+100:n),{token:contexts[0].session.token,revokedToken:revoked});
 for(const entry of contexts){
  await entry.helper.logout(sb);assert.equal(entry.helper.read(),null);
  const denied=await sb.rpc(`adjust_customer_reward_balance_${entry.role}_session_v1`,{p_session_token:entry.session.token,p_customer_id:id(10),p_amount:2,p_currency:'USD',p_note:null});assert.equal(Boolean(denied.error),true);assert.match(denied.error.message,/SESSION_INVALID/);
 }
 assert.equal((await db.query('select reward_balances from customers where id=$1',[id(10)])).rows[0].reward_balances.USD,106);
 console.log('PASS: real bcrypt login generates stored hashed sessions; actual admin/employee helpers verify identities, adjust rewards, approve/reject campaigns, logout, and reject reuse without changing balances');
}
