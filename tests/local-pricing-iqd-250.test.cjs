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
console.log('Pricing 250-IQD draft assertions passed (client only; server matching required).');
