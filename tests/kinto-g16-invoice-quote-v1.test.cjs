const test=require('node:test'),assert=require('node:assert/strict'),
 fs=require('node:fs'),path=require('node:path'),url=require('node:url');
const root=path.resolve(__dirname,'..');
const original=fs.readFileSync(path.join(root,'js/kinto-bundle-ui-v93.js'),'utf8');
function findFunction(name){
 const i=original.indexOf('function '+name+'(');
 if(i<0)throw Error('Canonical invoice missing '+name);
 const start=original.indexOf('{',i);let depth=0;
 for(let j=start;j<original.length;j++){
  if(original[j]==='{')depth++;
  if(original[j]==='}')depth--;
  if(depth===0)return original.slice(i,j+1);
 }
 throw Error('Canonical function not closed: '+name);
}
const canonical=new Function('const first=(...xs)=>xs.find(x=>x!=null&&String(x).trim())||"";\n'+
 ['details','campaignInfo','rewardInfo','globalTotals','collectionInfo','paidGoodsInfo'].map(findFunction).join('\n')+
 '\nreturn {globalTotals,paidGoodsInfo};')();
const load=()=>import(url.pathToFileURL(path.join(root,'supabase/functions/_shared/kinto-g16-invoice-quote-v1.mjs')).href);
const base=(changes={})=>({order_code:'KN-000160',updated_at:'2026-11-27T07:00:00Z',
 status:'تمت الموافقة - بانتظار الدفع',delivery_payment_type:'paid_prepaid',
 currency:'IQD',total_price:218000,external_shipping_fee:10000,delivery_fee:5000,
 details:'{}',...changes});
test('match existing shipped V94 invoice grand total including reward/campaign',async()=>{
 const {derive}=await load();
 for(const discount of [
  {},{reward_discount_amount:1000,reward_discount_currency:'IQD'},
  {kinto_campaign_discount_amount:2000,kinto_campaign_discount_currency:'IQD'},
  {reward_discount_amount:1000,reward_discount_currency:'IQD',
   kinto_campaign_discount_amount:2000,kinto_campaign_discount_currency:'IQD'}
 ]){
  const o=base(discount),quote=derive(o,'card_full'),current=canonical.globalTotals(o);
  assert.equal(quote.prepaidMinor,current.grand);
  assert.equal(quote.amountMinor,current.grand);
 }
});
test('match shipped V94 paid-goods invoice coupon net and keep shipping at door',async()=>{
 const {derive}=await load();
 const o=base({delivery_payment_type:'product_paid_delivery_cod',
  reward_discount_amount:1000,reward_discount_currency:'IQD'});
 const quote=derive(o,'goods_now_shipping_cod'),paid=canonical.paidGoodsInfo(o,{currency:'IQD',subtotal_local:218000});
 assert.equal(quote.goodsMinor,paid.net);
 assert.equal(quote.amountMinor,paid.net);
 assert.equal(quote.deliveryDueMinor,15000);
});
test('USD cents retained without conversion or rounding to Iraqi 250',async()=>{
 const {derive}=await load();
 const o=base({currency:'USD',total_price:'218.50',external_shipping_fee:'2.25',
  delivery_fee:'1.10',reward_discount_amount:'0.30',reward_discount_currency:'USD'});
 const quote=derive(o,'card_full');
 assert.equal(quote.amountMinor,22155);
 assert.equal(quote.currency,'USD');
});
test('mixed delivery currencies and unsupported foreign-currency discounts fail closed',async()=>{
 const {derive}=await load();
 assert.throws(()=>derive(base({delivery_currency:'USD'}),'card_full'),/MIXED_SHIPPING_CURRENCY_MANUAL_REQUIRED/);
 assert.throws(()=>derive(base({reward_discount_amount:1000,reward_discount_currency:'USD'}),'card_full'),
 /MIXED_DISCOUNT_CURRENCY_MANUAL_REQUIRED/);
 assert.throws(()=>derive(base({currency:'TRY'}),'card_full'),/INVOICE_CURRENCY_UNSUPPORTED/);
});
test('partial campaign, unapproved/stale revision, projected stock, incorrect mode all blocked',async()=>{
 const {derive}=await load();
 assert.throws(()=>derive(base({delivery_payment_type:'product_paid_delivery_cod',
  kinto_campaign_discount_amount:500}),'goods_now_shipping_cod'),/PARTIAL_CAMPAIGN_REVIEW_REQUIRED/);
 assert.throws(()=>derive(base({status:'تم التسديد'}),'card_full'),/ORDER_NOT_APPROVED/);
 assert.throws(()=>derive(base({updated_at:null}),'card_full'),/INVOICE_REVISION_UNAVAILABLE/);
 assert.throws(()=>derive(base({details:JSON.stringify({stock_adjustment_v58:{a:1}})}),'card_full'),/STOCK_PROJECTION_REVIEW_REQUIRED/);
 assert.throws(()=>derive(base({delivery_payment_type:'cod_full'}),'card_full'),/PAYMENT_MODE_MISMATCH/);
});
test('full COD returns no transfer amount but matches total payable at door',async()=>{
 const {derive}=await load();
 const o=base({delivery_payment_type:'cod_full'});
 const q=derive(o,'full_cod');
 assert.equal(q.amountMinor,0);assert.equal(q.prepaidMinor,canonical.globalTotals(o).grand);
});

test('V94 priority: authoritative coupon/campaign snapshot wins over conflicting legacy details',async()=>{
 const {derive}=await load();
 const o=base({reward_discount_amount:null,
  reward_discount_snapshot:{amount:1200,currency:'IQD'},
  kinto_campaign_discount_amount:null,
  kinto_campaign_discount_snapshot:{amount:700,currency:'IQD'},
  details:JSON.stringify({reward_discount_amount:8000,kinto_campaign_discount_amount:9000})});
 const quote=derive(o,'card_full'),current=canonical.globalTotals(o);
 assert.equal(quote.prepaidMinor,current.grand);
 assert.equal(quote.amountMinor,231100);
});

test('legacy order without updated_at still uses created_at, but never invents an invoice amount',async()=>{
 const {derive}=await load();
 const order=base({updated_at:null,created_at:'2026-11-27T06:00:00Z'});
 const quote=derive(order,'card_full');
 assert.equal(quote.version,'2026-11-27T06:00:00Z');
 assert.equal(quote.amountMinor,canonical.globalTotals(order).grand);
});
