const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const window={KintoBundleV93:{totals:o=>o._invoiceTotals}};
vm.runInNewContext(fs.readFileSync('js/kinto-unified-shipping-label-v1.js','utf8'),{window,console});
const api=window.KintoUnifiedShippingLabel;
const base={orderCode:'KN-000065',governorate:'بغداد',pieces:6,parcels:1};
const invoice=(grand,currency='IQD')=>({grand,currency,goods:90000,external:5000,delivery:5000,deliveryCurrency:currency,mixed:false,reward:{amount:0},campaign:{amount:0}});
function label(o){return api.render({...base,invoiceCollection:api.invoiceCollection(o)})}
assert.match(label({delivery_payment_type:'paid_prepaid'}),/مدفوع شامل/);
assert.doesNotMatch(label({delivery_payment_type:'paid_prepaid',total_price:100000}),/100,000/);
assert.match(label({delivery_payment_type:'cod_full',_invoiceTotals:invoice(100000)}),/100,000 IQD/);
assert.match(label({delivery_payment_type:'cod_full',_v95SegmentId:'seg1',_invoiceTotals:invoice(100000)}),/غير مؤكد/);
assert.match(label({delivery_payment_type:'cod_full'}),/غير مؤكد/);
assert.match(label({delivery_payment_type:'product_paid_delivery_cod',external_shipping_fee:15000,delivery_fee:5000,currency:'IQD'}),/20,000 IQD/);
assert.match(label({delivery_payment_type:'product_paid_delivery_cod',external_shipping_fee:15000,delivery_fee:5000,currency:'IQD',delivery_currency:'USD'}),/15,000 IQD.*5,000 USD/);
assert.match(label({delivery_payment_type:'product_paid_delivery_cod',external_shipping_fee:15000,currency:'IQD'}),/غير مؤكد/);
assert.match(label({delivery_payment_type:'product_paid_delivery_cod',external_shipping_fee:15000,delivery_fee:5000,currency:'IQD',_v95SegmentId:'seg1',external_shipping_collector_segment_id:'seg2'}),/5,000 IQD/);
assert.doesNotMatch(label({delivery_payment_type:'product_paid_delivery_cod',external_shipping_fee:15000,delivery_fee:5000,currency:'IQD',_v95SegmentId:'seg1',external_shipping_collector_segment_id:'seg2'}),/20,000/);
for(const file of ['employee-dashboard.html','admin-dashboard.html','branch-dashboard.html','vendor-dashboard-v2.html']){
 const html=fs.readFileSync(file,'utf8');
 assert.match(html,/KintoUnifiedShippingLabel\.invoiceCollection\(o\)/,file);
}
const vendorBridge=fs.readFileSync('js/vendor-v94-multistore-orders.js','utf8');
assert.match(vendorBridge,/row\.delivery_payment_type=control\.delivery_payment_type/);
assert.match(label({delivery_payment_type:'product_paid_delivery_cod',external_shipping_fee:15000,delivery_fee:5000,currency:'IQD',_v95SegmentId:'seg1'}),/غير مؤكد/);
assert.match(api.render(base),/@page\{size:100mm 100mm/);
assert.match(api.render(base),/JsBarcode/);
console.log('KINTO invoice-grounded unified shipping label tests passed');
