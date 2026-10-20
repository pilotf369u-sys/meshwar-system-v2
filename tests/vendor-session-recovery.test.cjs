const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const native=fs.readFileSync('vendor-dashboard-v2.html','utf8'),adapter=fs.readFileSync('js/vendor-v94-multistore-orders.js','utf8');
const active={token:'valid-token',expiresAt:new Date(Date.now()+3600000).toISOString()};
const line=name=>native.split('\n').find(l=>l.startsWith('function '+name+'(')||l.startsWith('async function '+name+'('));
const guard=native.slice(native.indexOf('function vendorHasActiveSession('),native.indexOf('async function loadDashboardOrders('));
function setup(session){
 const storage=new Map([['meshwar_vendor_store',JSON.stringify({id:'store'})]]);
 if(session!==undefined)storage.set('meshwar_vendor_session_v95',typeof session==='string'?session:JSON.stringify(session));
 const nodes=new Map(),calls=[];
 const $=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',disabled:false,src:'',classList:{add(c){this[c]=true},remove(c){this[c]=false}},focus(){}});return nodes.get(id)};
 const ctx={sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},vendorStore:{id:'store'},orders:[{id:'order'}],products:[{id:'product'}],vendorOrdersRealtime:null,$,console:{error(){},warn(){}},Date,PLACEHOLDER:'',sb:{rpc:async(name)=>{calls.push(name);return{data:{store:{id:'store'},session_token:'new-token',expires_at:active.expiresAt}}}},saveStoreSession:s=>storage.set('meshwar_vendor_store',JSON.stringify(s)),loadProducts:async()=>calls.push('products'),loadDashboardOrders:async()=>calls.push('orders'),loadFinance:async()=>{},loadVendorNotifV399:async()=>{},setupVendorOrdersRealtime:async()=>{},renderExchangePreview(){},showNotice:()=>{},syncProductPricingSnapshots:async()=>{},renderProducts(){},renderStats(){}};
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(guard+'\n'+line('openDashboard'),ctx);
 return{ctx,storage,nodes,calls,$};
}
(async()=>{
 for(const session of [undefined,'{bad',{token:'x',expiresAt:'bad-date'},{token:'x',expiresAt:new Date(Date.now()-1).toISOString()}]){
  const {ctx,storage,calls,$}=setup(session);await ctx.openDashboard();assert.equal(ctx.vendorStore,null);assert.equal($.call(null,'loginView').classList.hidden,false);assert.equal($.call(null,'dashboardView').classList.hidden,true);assert.equal(calls.length,0);assert(!storage.has('meshwar_vendor_store'));assert(!storage.has('meshwar_vendor_session_v95'));
 }
 const good=setup(active);await good.ctx.openDashboard();assert.deepEqual(good.calls,['products','orders']);assert(good.ctx.vendorStore);
 const revoked=setup(active);vm.runInContext(line('loadProducts'),revoked.ctx);revoked.ctx.sb.from=()=>({select:()=>({eq:()=>({order:async()=>({error:{message:'VENDOR_SESSION_INVALID'}})})})});await revoked.ctx.loadProducts();assert.equal(revoked.ctx.vendorStore,null);
 const network=setup(active);vm.runInContext(line('loadProducts'),network.ctx);network.ctx.sb.from=()=>({select:()=>({eq:()=>({order:async()=>({error:{message:'Failed to fetch'}})})})});await network.ctx.loadProducts();assert(network.ctx.vendorStore,'network errors must not log out the vendor');
 const login=setup(undefined);login.$('loginIdentity').value='vendor';login.$('loginPassword').value='password';vm.runInContext(line('vendorLogin'),login.ctx);await login.ctx.vendorLogin();assert.equal(JSON.parse(login.storage.get('meshwar_vendor_session_v95')).token,'new-token');assert(login.calls.includes('vendor_login_session'));assert(login.calls.includes('products'));assert(login.calls.includes('orders'));
 const perform=adapter.slice(adapter.indexOf('async function performSegmentOrdersLoad('),adapter.indexOf('\nfunction loadSegmentOrders('));
 for(const missing of [true,false]){
  let reads=0,relogin=0,cleared=0;
  const a={session:()=>missing?null:active,clearSession:()=>cleared++,runtime:{getStore:()=>({id:'store'}),requireSecureLogin:()=>relogin++,sb:{rpc:async()=>{reads++;return{error:{message:'ORDER_SESSION_REQUIRED'}}}}},fetchLegacy:async()=>{reads++;return[]},console:{error(){}},window:{}};
  vm.createContext(a);vm.runInContext(perform,a);await a.performSegmentOrdersLoad();assert.equal(relogin,1);assert.equal(reads,missing?0:2);assert.equal(cleared,missing?0:1);
 }
 console.log('PASS vendor session recovery: reproduce cached empty dashboard, missing/expired/malformed/revoked sessions, valid session loads, secure login restores data, network errors retain session, no unauthenticated order retries');
})().catch(error=>{console.error(error);process.exit(1)});
