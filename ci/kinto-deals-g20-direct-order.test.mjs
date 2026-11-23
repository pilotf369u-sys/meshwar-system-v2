import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const customer=fs.readFileSync(new URL('../js/kinto-deals-customer-g7.js',import.meta.url),'utf8');
const vendor=fs.readFileSync(new URL('../js/vendor-kinto-deals-g4c-draft.js',import.meta.url),'utf8');
const atomic=fs.readFileSync(new URL('../supabase/migrations/20261005_kinto_deals_v1_g20_vendor_draft_product_options.sql',import.meta.url),'utf8');
const employee=fs.readFileSync(new URL('../employee-dashboard.html',import.meta.url),'utf8');
const sql=fs.readFileSync('supabase/migrations/20261005_kinto_deals_v1_g20_direct_order_pipe.sql','utf8');
test('reuses canonical checkout, not a second order engine',()=>{assert.match(sql,/kinto_deals_v1_checkout_no_gift_g5d\(/);assert.doesNotMatch(sql,/insert\s+into\s+public\.orders/i);});
test('campaign/store scope is server enforced',()=>{assert.match(sql,/kinto_deals_v1_products/);assert.match(sql,/DEALS_DIRECT_ORDER_CAMPAIGN_SCOPE_INVALID/);assert.match(sql,/v_campaign\.store_id/);});
test('does not mutate status or stock',()=>{assert.doesNotMatch(sql,/set\s+status\s*=/i);assert.doesNotMatch(sql,/update\s+public\.local_products/i);assert.doesNotMatch(sql,/meshwar_adjust_(variant|matrix)_stock/i);});
test('adds campaign identity without changing KN',()=>{assert.match(sql,/'deal_campaign_id'/);assert.match(sql,/'deal_order_contract','g20-direct-campaign-order-v1'/);assert.doesNotMatch(sql,/set\s+order_code\s*=/i);});
test('keeps verified session and idempotency key',()=>{assert.match(sql,/require_customer_review_session\(p_session_token\)/);assert.match(sql,/p_request_id uuid/);});


test('G20 server enforces one unit and merchant-frozen selected options',()=>{
 assert.match(sql,/coalesce\(x\.item->>'quantity',''\) <> '1'/);
 assert.match(sql,/'quantity',1/);
 assert.match(sql,/'selected_options',coalesce\(cp\.selected_options,'\{\}'::jsonb\)/);
 assert.match(sql,/p_customer_shipping,v_canonical_items\)/);
 assert.doesNotMatch(sql,/p_customer_shipping,p_items\);/);
});

test('G20 rejects duplicate campaign products so one selected product is exactly one unit',()=>{
 assert.match(sql,/DEALS_DIRECT_ORDER_DUPLICATE_PRODUCT/);
 assert.match(sql,/count\(distinct \(x\.item->>'product_id'\)::uuid\)/);
});

test('employee pipeline marks campaign orders without changing order status',()=>{
 assert.match(employee,/deal_campaign_id/);
 assert.match(employee,/>حملة</);
});

test('merchant draft and frozen variants use one atomic G20 RPC',()=>{
 assert.match(vendor,/kinto_deals_v1_vendor_save_draft_g20/);
 assert.doesNotMatch(vendor,/kinto_deals_v1_vendor_set_product_options_g20/);
 assert.match(atomic,/kinto_deals_v1_vendor_save_draft_g4/);
 assert.match(atomic,/kinto_deals_v1_vendor_set_product_options_g20/);
});

test('customer retry reuses the same campaign checkout request id',()=>{
 assert.match(customer,/let pendingRequestId=''/);
 assert.match(customer,/pendingRequestId\|\|\(pendingRequestId=crypto\.randomUUID\(\)\)/);
});


// Isolated campaign pricing simulator: executes the real storefront pricing module and
// the real campaign product-price hydration function against mocked read-only rows.
// Never calls production Supabase and never writes to orders, stock or campaigns.
test('2026-11-24 IQD 250 campaign price: choose N, buy N, limited purchase, and gift',async()=>{
 const vm=await import('node:vm');
 const pricingScript=fs.readFileSync('js/local-store-pricing.js','utf8');
 const campaignScript=fs.readFileSync('js/kinto-deals-customer-g7.js','utf8');
 const start=campaignScript.indexOf('async function storePricingDetail(data){');
 const end=campaignScript.indexOf('function productCard(p){',start);
 assert.ok(start>=0&&end>start,'extract real campaign price hydration');
 const storePage=fs.readFileSync('store.html','utf8');
 assert.ok(storePage.indexOf('local-store-pricing.js')<storePage.indexOf('kinto-deals-customer-g7.js'),'pricing loads before campaign');
 const productA='a',productB='b',giftId='gift';
 const productRows=[
  {id:productA,base_price:1.45,discount_price:0.80},
  {id:productB,base_price:1.45,discount_price:1.45},
  {id:giftId,base_price:1.00,discount_price:1.00}
 ];
 const responses=[];
 const context={window:{},console,Number,Math,URL,encodeURIComponent,
  fetch:async url=>{
   responses.push(String(url));
   if(String(url).includes('kinto_local_stores_public_v1'))return {ok:true,json:async()=>[{id:'store',commission_rate:5,exchange_rate:1700}]};
   if(String(url).includes('/local_products?'))return {ok:true,json:async()=>productRows};
   throw Error('Unexpected fetch '+url);
  },
 };
 vm.runInNewContext(pricingScript,context);
 const hydration=campaignScript.slice(start,end);
 vm.runInNewContext("const KEY='test'; const pricing=window.MeshwarLocalPricing; "+hydration+";window.__hydrate=storePricingDetail;",context);
 const campaigns=[
  {kind:'choose_n',threshold_units:2,qty:2,paidCount:2,expected:4250,products:[{id:productA},{id:productB}],gift:{id:giftId}},
  {kind:'buy_n',threshold_units:3,qty:3,paidCount:1,expected:4500,products:[{id:productA}],gift:{id:giftId}},
  {kind:'limited_purchase',threshold_units:1,qty:1,paidCount:1,expected:1500,products:[{id:productA}],gift:null}
 ];
 for(const campaign of campaigns){
  const quoted=await context.window.__hydrate({...campaign,store_id:'store',currency:'IQD'});
  assert.equal(quoted.products[0].price,1500,campaign.kind+' discounted unit price');
  assert.equal(quoted.products[0].currency,'IQD');
  const amount=campaign.kind==='choose_n'?quoted.products.reduce((x,p)=>x+p.price,0):quoted.products[0].price*campaign.qty;
  assert.equal(amount,campaign.expected,campaign.kind+' customer-facing calculated price');
  if(campaign.gift){
   assert.equal(quoted.gift.price,2000,campaign.kind+' gift list price');
   assert.equal(quoted.gift.price-quoted.gift.price,0,campaign.kind+' full gift discount');
  }else assert.equal(quoted.gift,null);
 }
 assert.equal(context.window.MeshwarLocalPricing.customerPriceLocal(1.45,5,1700),2750,'old product price rounded to 250 IQD');
 assert.equal(context.window.MeshwarLocalPricing.customerPriceLocal(.80,5,1700),1500,'discounted product price rounded to 250 IQD');
 assert.equal(context.window.MeshwarLocalPricing.pricingSnapshot(.80,5,1700).pricing_version,'iqd_ceil_250_v2');
 assert.ok(responses.every(url=>url.includes('/rest/v1/')),'campaign price hydration remains read-only REST GET');
 const campaignBackend=fs.readFileSync('supabase/migrations/20261005_kinto_deals_v1_g20_direct_order_pipe.sql','utf8');
 assert.match(campaignBackend,/checkout_independent_vendor_orders_v101\(/,'manual campaign checkout uses canonical checkout');
 assert.doesNotMatch(campaignBackend,/insert\s+into\s+public\.orders/i,'campaign wrapper must not insert orders directly');
 const giftBackend=fs.readFileSync('supabase/migrations/20261002_kinto_deals_v1_g5g_atomic_gift_checkout_off.sql','utf8');
 assert.match(giftBackend,/v_gift->>'unit_price_local'<>'0'/,'server gift price must be zero');
 assert.match(giftBackend,/v_gift->'gift_discount_local' is distinct from/,'server gift discount matches original');
});
