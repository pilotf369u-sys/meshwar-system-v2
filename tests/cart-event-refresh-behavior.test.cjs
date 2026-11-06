// All Supabase calls in this test are mocked in memory. NEVER contact production.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync('js/local-cart-v93.js','utf8');
const CUSTOMER='11111111-1111-4111-8111-111111111111';
const product=(id='p1')=>({store_id:'s1',store_name:'Store',product_id:id,product_name:id,unit_price_local:1000,quantity:1,stock_product:{id,stock_quantity:20,options:{}}});
const nextTick=()=>new Promise(resolve=>setImmediate(resolve));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function backend(){
  const db={revision:0,items:[],reads:0,writes:0};
  const fetch=async (url,opts={})=>{
    assert.match(url,/hsmmbloouskqdnptiiad\.supabase\.co/);
    const request=JSON.parse(opts.body||'{}');
    let status=200,result;
    if(url.includes('/customer_cart_get_v189')){
      db.reads++; result={revision:db.revision,items:structuredClone(db.items)};
    }else if(url.includes('/customer_cart_put_v189')){
      db.writes++;
      if(request.p_expected_revision!==db.revision){status=409;result={message:'CART_REVISION_CONFLICT'};}
      else{db.items=structuredClone(request.p_items);db.revision++;result={revision:db.revision};}
    }else{throw new Error('Unexpected endpoint: '+url);}
    return {ok:status===200,status,text:async()=>JSON.stringify(result)};
  };
  return {db,fetch};
}
function device(server){
  const winEvents=new Map(),docEvents=new Map(),alerts=[];
  const on=(map,name,fn)=>{const bucket=map.get(name)||[];bucket.push(fn);map.set(name,bucket)};
  const localStorage={getItem:key=>key==='meshwar_customer_id'?CUSTOMER:null};
  const document={hidden:false,readyState:'loading',getElementById:id=>id==='kintoLocalCartDrawer'?{hasAttribute:()=>false}:null,
    documentElement:{classList:{add(){},remove(){}}},addEventListener:(name,fn)=>on(docEvents,name,fn)};
  const window={KintoCustomerSessionV150:{read:()=>({token:'fixture-session'})},addEventListener:(name,fn)=>on(winEvents,name,fn),
    dispatchEvent:()=>{},location:{search:''}};
  const context=vm.createContext({window,document,localStorage,fetch:server.fetch,URLSearchParams,URL,AbortController,
    setTimeout,clearTimeout,setInterval:()=>{throw new Error('Unexpected recurring timer!')},clearInterval:()=>{},
    CustomEvent:class{},alert:msg=>alerts.push(msg),location:{search:''},console:{warn(){},error(){},log(){}},Date});
  vm.runInContext(source,context,{filename:'local-cart-v93.js'});
  const emit=(map,name,arg={})=>(map.get(name)||[]).forEach(fn=>fn(arg));
  return {api:window.KintoLocalCartV93,alerts,document,start:async()=>{emit(docEvents,'DOMContentLoaded');await nextTick();await nextTick()},
    foreground:async()=>{document.hidden=false;emit(docEvents,'visibilitychange');await nextTick();await nextTick()},
    blur:()=>{document.hidden=true;emit(docEvents,'visibilitychange')},focus:async()=>{emit(winEvents,'focus');await nextTick();await nextTick()},
    back:async()=>{emit(winEvents,'pageshow',{persisted:true});await nextTick();await nextTick()}};
}
test('idle page no longer fetches cart continuously',async()=>{
  const server=backend(),a=device(server);
  await a.start();
  assert.equal(server.db.reads,1);
  await delay(100);
  assert.equal(server.db.reads,1);
  a.blur(); await a.foreground();
  assert.equal(server.db.reads,2);
});
test('two-device edits keep remote revision authoritative and reject stale writer',async()=>{
  const server=backend(),a=device(server),b=device(server);
  await Promise.all([a.start(),b.start()]);
  a.api.add(product('p1'));
  await delay(430);
  assert.equal(server.db.items.length,1);
  assert.equal(server.db.revision,1);
  b.api.add(product('p2'));
  await delay(430);
  assert.equal(server.db.items.length,1,'stale device must not overwrite the first device');
  assert.equal(server.db.items[0].product_id,'p1');
  assert.ok(b.alerts.some(x=>x.includes('جهاز آخر')),'stale write requires a conflict warning');
});
test('foreground refresh obtains changes made by another device without overwriting them',async()=>{
  const server=backend(),a=device(server),b=device(server);
  await Promise.all([a.start(),b.start()]);
  a.api.add(product('p1'));await delay(430);
  b.blur();await b.foreground();
  assert.equal(b.api.getCount(),1);
  assert.equal(server.db.writes,1);
});
test('page recovery after an initial read failure does not enable unsafe cart writes',async()=>{
  const server=backend(),base=server.fetch;
  let fail=true;
  server.fetch=async (...args)=>{if(fail&&args[0].includes('customer_cart_get_v189'))throw new Error('offline fixture');return base(...args)};
  const a=device(server);await a.start();
  assert.equal(a.api.getCount(),0);
  // Once the cloud comes back, foreground triggers a new authoritative fetch.
  fail=false;await a.foreground();
  assert.equal(server.db.reads,1);
  assert.equal(server.db.writes,0);
});

test('selection and deletion are committed to remote cart, not browser storage',async()=>{
  const server=backend(),a=device(server);
  await a.start();
  a.api.add(product('p1'));await delay(430);
  assert.equal(server.db.items[0].selected,true);
  const key='s1::p1::||';
  a.api.setSelected(key,false);await delay(430);
  assert.equal(server.db.items[0].selected,false);
  a.api.remove(key);await delay(430);
  assert.equal(server.db.items.length,0);
  assert.equal(a.api.getCount(),0);
  assert.equal(server.db.revision,3);
});
test('restoring a BFCache page refreshes cart from the server without recurring fetches',async()=>{
  const server=backend(),a=device(server);
  await a.start();
  server.db.items=[product('remote')];
  server.db.revision=1;
  await a.back();
  assert.equal(a.api.getCount(),1);
  assert.equal(server.db.reads,2);
  await delay(100);
  assert.equal(server.db.reads,2);
});
test('hidden tab is not refreshed while invisible',async()=>{
  const server=backend(),a=device(server);
  await a.start();
  a.blur();await a.focus();
  assert.equal(server.db.reads,1);
});
