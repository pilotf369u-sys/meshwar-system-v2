// Exact checkout branch is exercised against mocked Supabase interfaces.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const code=fs.readFileSync('js/local-cart-v93.js','utf8');
const CUSTOMER='11111111-1111-4111-8111-111111111111';
const product={store_id:'store-1',store_name:'Store',product_id:'p-1',product_name:'Product',unit_price_local:1000,quantity:2,selected:true,
 stock_product:{id:'p-1',stock_quantity:20,is_out_of_stock:false,options:{}}};
function setup({checkoutFails=false}={}){
  const logs={writes:[],calls:[],alerts:[],remoteItems:[],rev:0};
  const events=new Map(),docEvents=new Map();
  const on=(m,name,cb)=>m.set(name,[...(m.get(name)||[]),cb]);
  const localStorage={getItem:key=>key==='meshwar_customer_id'?CUSTOMER:null};
  const document={readyState:'loading',hidden:false,documentElement:{classList:{add(){},remove(){}}},
    addEventListener:(name,cb)=>on(docEvents,name,cb),getElementById:id=>id==='kintoLocalCartDrawer'?{hasAttribute:()=>false}:null};
  const win={KintoCustomerSessionV150:{read:()=>({token:'session-fixture'})},
    KintoPaymentP5V1:{getMode:async()=> 'manual'},
    addEventListener:(name,cb)=>on(events,name,cb),dispatchEvent:()=>{}};
  const fetch=async (url,opts={})=>{
    const request=opts.body?JSON.parse(opts.body):{};
    logs.calls.push(String(url).split('/rest/v1/')[1]);
    let result,code=200;
    if(url.includes('rpc/customer_cart_get_v189'))result={items:structuredClone(logs.remoteItems),revision:logs.rev};
    else if(url.includes('rpc/customer_cart_put_v189')){
      if(request.p_expected_revision!==logs.rev){result={message:'CART_REVISION_CONFLICT'};code=409;}
      else{logs.remoteItems=structuredClone(request.p_items);logs.rev++;logs.writes.push(structuredClone(request));result={revision:logs.rev};}
    }else if(url.includes('local_products?'))result=[{id:'p-1',stock_quantity:20,options:{}}];
    else if(url.includes('rpc/kinto_checkout_session_v1')){
      if(checkoutFails){result={message:'SIMULATED_ORDER_FAILURE'};code=500;}
      else result={orders:[{order_code:'KN-000123'}],checkout_group_id:'fixture-group'};
    }else throw Error('Unexpected remote path '+url);
    return {ok:code===200,status:code,text:async()=>JSON.stringify(result)};
  };
  const KintoCustomerDirectoryV1={from:()=>({eq(){return this},limit:async()=>({data:[{id:CUSTOMER,city:'Erbil'}],error:null})})};
  const context=vm.createContext({window:win,document,localStorage,fetch,KintoCustomerDirectoryV1,URLSearchParams,URL,AbortController,
    alert:x=>logs.alerts.push(x),CustomEvent:class{},setTimeout,clearTimeout,console,Date});
  vm.runInContext(code,context);
  const tick=()=>new Promise(resolve=>setImmediate(resolve));
  async function start(){(docEvents.get('DOMContentLoaded')||[]).forEach(fn=>fn());await tick();await tick()}
  return {logs,api:win.KintoLocalCartV93,start,tick};
}
test('success: one independent order confirmed before cloud cart cleanup',async()=>{
  const s=setup();await s.start();
  s.api.add(product);await new Promise(r=>setTimeout(r,430));
  assert.equal(s.logs.remoteItems.length,1);
  const result=await s.api.checkout();
  assert.equal(result.ok,true);
  assert.equal(s.logs.remoteItems.length,0,'confirmed order must clean submitted product');
  assert.deepEqual(s.logs.calls.filter(x=>x.includes('kinto_checkout_session_v1')).length,1);
  assert.equal(s.logs.calls.filter(x=>x.includes('customer_cart_put_v189')).length,2);
  const checkoutIdx=s.logs.calls.findIndex(x=>x.includes('kinto_checkout_session_v1'));
  const cleanupIdx=s.logs.calls.findIndex((x,i)=>i>checkoutIdx&&x.includes('customer_cart_put_v189'));
  assert.ok(cleanupIdx>checkoutIdx,'cart cleanup must happen after successful checkout RPC');
});
test('failed checkout never clears confirmed cloud cart',async()=>{
  const s=setup({checkoutFails:true});await s.start();
  s.api.add(product);await new Promise(r=>setTimeout(r,430));
  const result=await s.api.checkout();
  assert.equal(result.ok,false);
  assert.equal(s.logs.remoteItems.length,1,'failed checkout must retain confirmed product');
  assert.equal(s.logs.calls.filter(x=>x.includes('customer_cart_put_v189')).length,1);
});
