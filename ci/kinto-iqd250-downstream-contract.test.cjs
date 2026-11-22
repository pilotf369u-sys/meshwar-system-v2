// KINTO IQD-250 downstream contract: pricing changes must not reinterpret collection/print status.
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const context={window:{KintoBundleV93:{totals:o=>o._invoiceTotals}},console};
vm.runInNewContext(fs.readFileSync('js/local-store-pricing.js','utf8').split('/* PUBLIC_SITE_SETTINGS_CMS_V3 */')[0],context);
vm.runInNewContext(fs.readFileSync('js/kinto-unified-shipping-label-v1.js','utf8'),context);
const pricing=context.window.MeshwarLocalPricing;
const label=context.window.KintoUnifiedShippingLabel;
const price=(usd)=>pricing.customerPriceLocal(usd,5,1770);
assert.equal(price(1),2000,'discounted vendor-price IQD');
assert.equal(price(2),3750,'regular vendor-price IQD');
assert.equal(price(1.16),2250,'merchant 45%-margin price IQD');
for(const value of [0,0.5,0.8,1,1.16,2,9.99,19.5]){
  assert.equal(price(value)%250,0,'IQD amount must be in 250-IQD increments');
  assert.ok(price(value)>=value/0.95*1770,'rounding cannot charge less than raw');
  assert.ok(price(value)-value/0.95*1770<250.00001,'rounding excess less than 250');
}
function render(o){return label.render({orderCode:'KN-001100',invoiceCollection:label.invoiceCollection(o)})}
const cod={delivery_payment_type:'cod_full',_invoiceTotals:{grand:2000,currency:'IQD',goods:2000,external:0,delivery:0,deliveryCurrency:'IQD',mixed:false,reward:{amount:0},campaign:{amount:0}}};
assert.match(render(cod),/2,000 IQD/,'new priced COD grand must transfer unchanged');
assert.match(render({...cod,_invoiceTotals:{...cod._invoiceTotals,grand:3750,goods:3750}}),/3,750 IQD/,'non-1000 integer label print must work');
assert.match(render({...cod,_invoiceTotals:{...cod._invoiceTotals,grand:2250,goods:2250}}),/2,250 IQD/,'non-1000 integer label print must work');
assert.match(render({...cod,_invoiceTotals:{...cod._invoiceTotals,grand:2000,goods:2250,reward:{amount:250,currency:'IQD'}}}),/2,000 IQD/,'invoiced discount already included in grand');
assert.match(render({delivery_payment_type:'paid_prepaid',total_price:3750}),/واصل/,'prepaid remains wasel');
assert.doesNotMatch(render({delivery_payment_type:'paid_prepaid',total_price:3750}),/3,750 IQD/,'never recollect prepaid merchandise');
assert.match(render({delivery_payment_type:'product_paid_delivery_cod',currency:'IQD',external_shipping_fee:0,delivery_fee:5000,total_price:3750}),/5,000 IQD/,'goods paid, delivery COD only');
assert.doesNotMatch(render({delivery_payment_type:'product_paid_delivery_cod',currency:'IQD',external_shipping_fee:0,delivery_fee:5000,total_price:3750}),/3,750 IQD/,'do not collect prepaid goods twice');
assert.match(render({...cod,_v95SegmentId:'seg1'}),/غير مؤكد/,'segment without authorized invoice still fail closed');
assert.match(fs.readFileSync('supabase/migrations/20261001_v411_campaign_instant_order_discount.sql','utf8'),/amount:=least\(camp\.reward_amount::numeric,product_total\)/,'campaign discount must be capped at merchandise total');
assert.match(fs.readFileSync('js/local-cart-v93.js','utf8'),/p_items:rpcItems/,'checkout uses ids & quantities and server re-quotes');
console.log('IQD-250 downstream price/label/campaign invariants passed (repository-only, not live DB).');
