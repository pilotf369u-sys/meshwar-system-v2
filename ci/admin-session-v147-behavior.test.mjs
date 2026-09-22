import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const values=new Map();
const sessionStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
const window={};
vm.runInNewContext(fs.readFileSync(new URL('../js/admin-session-v147.js',import.meta.url),'utf8'),{window,sessionStorage,Date,JSON,Object,String,Number,Error});
const sessions=window.KintoAdminSessionV147;
const calls=[];
const supabase={rpc:async(name,args)=>{
  calls.push([name,args]);
  if(name==='admin_login_v147')return {data:{ok:true,session_token:'admin-token-147',expires_at:new Date(Date.now()+3600000).toISOString(),admin:{id:'admin-1',role:'admin'}},error:null};
  if(name==='admin_session_identity_v147')return {data:{ok:true,admin:{id:'admin-1',name:'أدمن',role:'admin'}},error:null};
  if(name==='admin_logout_v147')return {data:true,error:null};
  throw new Error('unexpected RPC');
}};

assert.equal((await sessions.login(supabase,'admin-code','secret')).ok,true);
assert.equal(sessions.read().token,'admin-token-147');
assert.equal((await sessions.identity(supabase)).id,'admin-1');
await sessions.logout(supabase);
assert.equal(sessions.read(),null);
assert.deepEqual(calls.map(([name])=>name),['admin_login_v147','admin_session_identity_v147','admin_logout_v147']);

sessions.save({token:'expired',expiresAt:new Date(Date.now()-1000).toISOString()});
assert.equal(sessions.read(),null);
sessions.save({token:'clear-on-error',expiresAt:new Date(Date.now()+3600000).toISOString()});
await assert.rejects(sessions.logout({rpc:async()=>{throw new Error('network failure')}}));
assert.equal(sessions.read(),null,'logout must clear the browser session even when revocation fails');
console.log('admin verified session V147 behavior: ok');
