const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const window = {};
vm.runInNewContext(fs.readFileSync('js/local-store-pricing.js','utf8').split('/* PUBLIC_SITE_SETTINGS_CMS_V3 */')[0], {window,Math,Number});
const p = window.MeshwarLocalPricing;
const usd = (price) => p.customerPriceUSD(price,5);
const iqd = (price) => p.customerPriceLocal(price,5,1770);
assert.ok(Math.abs(usd(1)-1/0.95)<1e-10, 'No rounding to a whole dollar');
assert.equal(iqd(1),2000, '$1 discounted vendor price');
assert.equal(iqd(2),3750, '$2 regular vendor price');
assert.equal(iqd(1.16),2250, '$0.80 cost + 45% margin');
assert.equal(iqd(0.8),1500, 'Small items preserve sub-dollar pricing');
assert.equal(iqd(0),0, 'Zero is stable');
assert.equal(iqd(1.16)%250,0,'Final IQD amount is a multiple of 250');
assert.equal(p.discountPercent(2,1),50,'Discount remains based on vendor prices');

// Profit margin belongs to vendor cost->base; platform commission is a separate store rate.
// Both controls can independently be zero. 5% is ONLY the example above, never a fixed rate.
const marginPrice=(cost,margin)=>Number((cost*(1+margin/100)).toFixed(2));
assert.equal(marginPrice(0.8,0),0.8,'Zero vendor margin retains cost');
assert.equal(marginPrice(0.8,45),1.16,'45% vendor margin retains cents');
assert.equal(marginPrice(0,45),0,'Zero cost remains zero');
assert.equal(p.customerPriceUSD(0.8,0),0.8,'Zero platform commission retains vendor USD');
assert.equal(p.customerPriceLocal(0.8,0,1770),1500,'Zero/zero independent rates still round IQD once');
assert.equal(p.customerPriceLocal(1.16,0,1770),2250,'45% vendor margin with 0% platform commission');
assert.equal(p.customerPriceLocal(1.16,5,1770),2250,'45% vendor margin with 5% platform commission');
assert.equal(p.customerPriceLocal(0.8,10,1770),1750,'0% vendor margin with 10% platform commission');
assert.equal(p.customerPriceLocal(0.8,20,1770),2000,'0% vendor margin with 20% platform commission');
for (const vendorMargin of [0,5,15,45,100]) {
  for (const platformCommission of [0,1,5,10,20,50]) {
    const vendorUsd=marginPrice(0.8,vendorMargin);
    const raw=vendorUsd/(1-platformCommission/100)*1770;
    const actual=p.customerPriceLocal(vendorUsd,platformCommission,1770);
    assert.equal(actual,Math.ceil(raw/250)*250,`vendor margin ${vendorMargin}%, platform commission ${platformCommission}%`);
    assert.equal(actual%250,0,'IQD increments');
  }
}


// Test the ACTUAL vendor autoPrice function; toFixed(2) previously failed at 1.005/3.015.
const vendorWindow={};
vm.runInNewContext(fs.readFileSync('js/vendor-barcode-margin-autopricing-v22.js','utf8'),{window:vendorWindow,console,Math,Number,BigInt});
const autoPrice=vendorWindow.MeshwarVendorBarcodeMarginV22.autoPrice;
function merchantAutoPrice(cost,margin){
  const nodes={
    mwProductCostPrice:{value:String(cost)},
    productBasePrice:{value:'',dispatchEvent(){}},
    mwGlobalProfitMargin:{value:String(margin)},
    mwAutoPriceHint:{textContent:''}
  };
  const host={document:{getElementById:id=>nodes[id]},Event:class Event{}};
  autoPrice(host);
  assert.ok(nodes.mwAutoPriceHint.textContent.includes('سعر البيع المقترح:'),'Vendor cost hint remains present');
  return Number(nodes.productBasePrice.value);
}
assert.equal(merchantAutoPrice(0.8,0),0.8,'Zero vendor margin');
assert.equal(merchantAutoPrice(0.8,45),1.16,'45% vendor margin');
assert.equal(merchantAutoPrice(1,0.5),1.01,'Half-cent boundary 1.005 USD must round 1.01');
assert.equal(merchantAutoPrice(2.01,50),3.02,'Half-cent boundary 3.015 USD must round 3.02');
assert.equal(merchantAutoPrice(1,1.5),1.02,'Half-cent boundary 1.015 USD must round 1.02');
assert.equal(merchantAutoPrice(0,50),0,'Zero cost remains zero');

console.log('Pricing 250-IQD draft assertions passed (client only; server matching required).');
