import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const values=new Map();
const sessionStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
const removed=[];
const window={document:{documentElement:{classList:{remove:value=>removed.push(value)}}}};
vm.runInNewContext(fs.readFileSync(new URL('../js/courier-session-v149.js',import.meta.url),'utf8'),{window,sessionStorage,Date,JSON,Object,String,Number,Error});
const sessions=window.KintoCourierSessionV149,calls=[];
const expiresAt=new Date(Date.now()+3600000).toISOString();
const supabase={rpc:async(name,args)=>{calls.push([name,args]);if(name==='courier_login_v149')return {data:{ok:true,session_token:'courier-token',expires_at:expiresAt,courier:{id:'courier-1',branch_id:'branch-1'}},error:null};if(name==='courier_session_identity_v149')return {data:{ok:true,courier:{id:'courier-1',branch_id:'branch-1'}},error:null};if(name==='courier_logout_v149')return {data:true,error:null};throw new Error('unexpected rpc')}};

const loggedIn=await sessions.login(supabase,'555','secret');
assert.equal(loggedIn.ok,true);
assert.equal(sessions.read().token,'courier-token');
assert.equal((await sessions.identity(supabase)).id,'courier-1');
assert.deepEqual(removed,['courier-auth-pending']);
await sessions.logout(supabase);
assert.equal(sessions.read(),null);
assert.deepEqual(calls.map(([name])=>name),['courier_login_v149','courier_session_identity_v149','courier_logout_v149']);

sessions.save({token:'logout-even-on-error',expiresAt});
await assert.rejects(sessions.logout({rpc:async()=>{throw new Error('network failure')}}));
assert.equal(sessions.read(),null,'logout must clear the browser session even when revocation fails');

console.log('courier verified session V149 behavior: ok');
