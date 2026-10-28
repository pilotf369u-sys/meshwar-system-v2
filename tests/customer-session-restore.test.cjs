const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const helper=fs.readFileSync('js/customer-session-v150.js','utf8');
const login=fs.readFileSync('login.html','utf8');
const restore=login.slice(login.indexOf('function restoreCustomerLogin(){'),login.indexOf('if(!restoreCustomerLogin())'));
const P='kinto_customer_session_v150',S='kinto_customer_review_session_v132',R='kinto_customer_login_restore_attempted_v150';
const future='2099-01-01T00:00:00Z';
function boot(local=new Map(),tab=new Map()){
 const storage=m=>({getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)});
 const redirects=[],timers=[];
 const c={localStorage:storage(local),sessionStorage:storage(tab),Date,URLSearchParams,console:{error(){}},setTimeout:fn=>{timers.push(fn);return 1},location:{search:'',replace:u=>redirects.push(u)}};
 c.window=c;vm.createContext(c);vm.runInContext(helper+'\n'+restore,c);
 return {c,api:c.KintoCustomerSessionV150,local,tab,redirects,timers};
}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
test('cold JS context restores the existing token and expiry, with no identity or login RPC on login page',()=>{
 const first=boot();first.api.save('A',future);const next=boot(first.local);
 assert.equal(next.api.read().token,'A');assert.equal(next.api.read().expiresAt,future);
 assert.equal(next.c.restoreCustomerLogin(),true);assert.deepEqual(next.redirects,['dashboard.html']);
 assert(!next.redirects[0].includes('A'));assert.equal(next.timers.length,0);
 assert.equal(next.c.restoreCustomerLogin(),false);
 assert(!/rpc\(|identity\(|fetch\(|setInterval|setTimeout/.test(restore));
});
test('successful dashboard verification uses one existing RPC and clears one-shot restore guard',async()=>{
 const x=boot();x.api.save('A',future);x.c.restoreCustomerLogin();const calls=[];
 assert.equal((await x.api.identity({rpc:async(n,a)=>{calls.push({n,a});return {data:{ok:true,customer:{id:'server-A'}}}}})).id,'server-A');
 assert.equal(calls.length,1);assert.equal(calls[0].n,'customer_session_identity_v150');assert.equal(x.tab.has(R),false);assert.equal(x.timers.length,0);
});
test('logout clears both copies and blocks restoration even if server revoke fails',async()=>{
 const x=boot();x.api.save('A',future);const calls=[];
 await x.api.logout({rpc:async(n)=>{calls.push(n);throw Error('offline')}});
 assert.deepEqual(calls,['customer_review_logout_v132']);assert(!x.local.has(P));assert(!x.tab.has(S));
 assert.equal(boot(x.local).c.restoreCustomerLogin(),false);
});
test('expired, missing, malformed expiry, and local identity alone cannot auto-restore',()=>{
 for(const expiresAt of ['2000-01-01',undefined,'bad-date']){
  const x=boot(new Map([[P,JSON.stringify({token:'A',expiresAt})],['meshwar_customer_id','previous']]));
  assert.equal(x.c.restoreCustomerLogin(),false);assert.equal(x.redirects.length,0);
 }
 assert.equal(boot(new Map([['meshwar_customer_id','previous']])).c.restoreCustomerLogin(),false);
});
test('other role sessions and explicit role targets keep the shared login form',()=>{
 for(const key of ['kinto_admin_session_v147','kinto_employee_session_v143','kinto_branch_session_v148','kinto_courier_session_v149','kinto_world_staff_session_v1','meshwar_vendor_session_v95']){
  const x=boot();x.api.save('A',future);x.tab.set(key,'existing');assert.equal(x.c.restoreCustomerLogin(),false);
 }
 for(const query of ['?screen=admin','?role=vendor','?viewedBy=employee','?next=global-order-review.html']){const x=boot();x.api.save('A',future);x.c.location.search=query;assert.equal(x.c.restoreCustomerLogin(),false);}
});
test('network failure preserves token and expiry without a redirect loop or periodic requests',async()=>{
 const x=boot();x.api.save('A',future);x.c.restoreCustomerLogin();let calls=0;
 const pending=x.api.identity({rpc:async()=>{calls++;return {error:{message:'Failed to fetch'}}}});
 await new Promise(setImmediate);x.timers.shift()();assert.equal(await pending,null);assert.equal(calls,2);
 const again=boot(x.local,x.tab);assert.equal(again.c.restoreCustomerLogin(),false);
 assert.equal(again.api.read().token,'A');assert.equal(again.api.read().expiresAt,future);assert.equal(x.timers.length,0);
});
test('thrown network failure retains the guard and token without scheduling retries',async()=>{
 const x=boot();x.api.save('A',future);x.c.restoreCustomerLogin();let calls=0;
 await assert.rejects(x.api.identity({rpc:async()=>{calls++;throw Error('offline')}}),/offline/);
 assert.equal(x.c.restoreCustomerLogin(),false);assert.equal(x.api.read().token,'A');assert.equal(calls,1);assert.equal(x.timers.length,0);
});
test('server rejection clears the current revoked token; next opening requests login',async()=>{
 const x=boot();x.api.save('A',future);let calls=0;
 const pending=x.api.identity({rpc:async()=>{calls++;return {error:{message:'REVIEW_SESSION_INVALID'}}}});
 await new Promise(setImmediate);x.timers.shift()();assert.equal(await pending,null);assert.equal(calls,2);
 assert.equal(boot(x.local).api.read(),null);assert.equal(x.c.restoreCustomerLogin(),false);
});
for(const response of [{data:{ok:true,customer:{id:'A'}}},{error:{message:'REVIEW_SESSION_INVALID'}}]){
 for(const action of ['logout','switch','same-token-relogin','cross-context-switch','expire']){
  test(`late ${response.data?'success':'rejection'} cannot restore/erase identity after ${action}`,async()=>{
   const x=boot();x.api.save('A',future);const d=deferred();let calls=0;
   const pending=x.api.identity({rpc:()=>{calls++;return d.promise}});
   if(action==='logout'||action==='same-token-relogin')await x.api.logout({rpc:async()=>({})});
   if(action==='switch')x.api.save('B',future);
   if(action==='same-token-relogin')x.api.save('A',future);
   if(action==='cross-context-switch')boot(x.local).api.save('B',future);
   if(action==='expire'){const expired=JSON.stringify({token:'A',expiresAt:'2000-01-01'});x.tab.set(S,expired);x.local.set(P,expired);}
   d.resolve(response);assert.equal(await pending,null);assert.equal(calls,1);assert.equal(x.timers.length,0);
   if(action==='switch'||action==='cross-context-switch')assert.equal(JSON.parse(x.local.get(P)).token,'B');
   if(action==='same-token-relogin')assert.equal(x.api.read().token,'A');
   if(action==='logout'||action==='expire')assert.equal(x.api.read(),null);
  });
 }
}
test('switching while existing retry is pending cancels its second RPC',async()=>{
 const x=boot();x.api.save('A',future);let calls=0;
 const pending=x.api.identity({rpc:async()=>{calls++;return {error:{message:'offline'}}}});
 await new Promise(setImmediate);x.api.save('B',future);x.timers.shift()();assert.equal(await pending,null);assert.equal(calls,1);assert.equal(x.api.read().token,'B');
});
