import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const values=new Map();
const sessionStorage={
  getItem:key=>values.has(key)?values.get(key):null,
  setItem:(key,value)=>values.set(key,String(value)),
  removeItem:key=>values.delete(key)
};
const window={};
vm.runInNewContext(fs.readFileSync(new URL('../js/employee-session-v143.js',import.meta.url),'utf8'),{window,sessionStorage,Date,JSON,Object,String,Number,Error});
const sessions=window.KintoEmployeeSessionV143;

const calls=[];
const supabase={rpc:async(name,args)=>{
  calls.push([name,args]);
  if(name==='employee_login_v143')return {data:{ok:true,session_token:'token-143',expires_at:new Date(Date.now()+3600000).toISOString(),employee:{id:'emp-1',role:'employee'}},error:null};
  if(name==='employee_session_identity_v143')return {data:{ok:true,employee:{id:'emp-1',name:'موظف',role:'employee'}},error:null};
  if(name==='employee_logout_v143')return {data:true,error:null};
  throw new Error('unexpected RPC');
}};

const loggedIn=await sessions.login(supabase,'employee-code','secret');
assert.equal(loggedIn.ok,true);
assert.equal(sessions.read().token,'token-143');
assert.equal((await sessions.identity(supabase)).id,'emp-1');
await sessions.logout(supabase);
assert.equal(sessions.read(),null);
assert.deepEqual(calls.map(([name])=>name),['employee_login_v143','employee_session_identity_v143','employee_logout_v143']);

sessions.save({token:'expired',expiresAt:new Date(Date.now()-1000).toISOString()});
assert.equal(sessions.read(),null,'expired sessions must be removed before use');

console.log('employee session helper V143 behavior: ok');
