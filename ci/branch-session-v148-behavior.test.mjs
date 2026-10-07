import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const values=new Map();
const sessionStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
const removed=[];
const window={document:{documentElement:{classList:{remove:value=>removed.push(value)}}}};
vm.runInNewContext(fs.readFileSync(new URL('../js/branch-session-v148.js',import.meta.url),'utf8'),{window,sessionStorage,Date,JSON,Object,String,Number,Error});
const sessions=window.KintoBranchSessionV148,calls=[];
const expiresAt=new Date(Date.now()+3600000).toISOString();
const supabase={rpc:async(name,args)=>{calls.push([name,args]);if(name==='branch_login_v148')return {data:{ok:true,session_token:'branch-token',expires_at:expiresAt,branch:{id:'branch-1',name:'Branch 1'}},error:null};if(name==='branch_session_identity_v148')return {data:{ok:true,branch:{id:'branch-1',name:'Branch 1'}},error:null};if(name==='branch_logout_v148')return {data:true,error:null};throw new Error('unexpected rpc')}};

const loggedIn=await sessions.login(supabase,'BR-1','secret');
assert.equal(loggedIn.ok,true);
assert.equal(sessions.read().token,'branch-token');
assert.equal((await sessions.identity(supabase)).id,'branch-1');
assert.deepEqual(removed,['branch-auth-pending']);
await sessions.logout(supabase);
assert.equal(sessions.read(),null);
assert.deepEqual(calls.map(([name])=>name),['branch_login_v148','branch_session_identity_v148','branch_logout_v148']);

sessions.save({token:'logout-even-on-error',expiresAt});
await assert.rejects(sessions.logout({rpc:async()=>{throw new Error('network failure')}}));
assert.equal(sessions.read(),null,'logout must clear the browser session even when revocation fails');

console.log('branch verified session V148 behavior: ok');
