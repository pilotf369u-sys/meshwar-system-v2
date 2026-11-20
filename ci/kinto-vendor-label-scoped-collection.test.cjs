const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('js/vendor-v94-multistore-orders.js','utf8');
const begin=source.indexOf('async function labelInvoiceCollection(order){');
const end=source.indexOf('window.KintoVendorLabelInvoiceCollection=labelInvoiceCollection;',begin);
assert(begin>=0&&end>begin,'vendor label collection function is present');
const fnCode=source.slice(begin,end);
const order={id:'s1',_v95SegmentId:'s1',_v95OrderId:'parent1',currency:'IQD',delivery_currency:'IQD'};
async function run(shipping,canonical={}){
 const calls=[];
 const context={
  session:()=>({token:'test'}),
  detailCache:new Map([['s1',{}]]),
  shippingControlCache:new Map([['s1',shipping]]),
  hydrateVendorCanonicalInvoice:async()=>canonical,
  runtime:{sb:{rpc:async(name)=>{calls.push(name);return {data:shipping}}}},
  window:{},String,Number,Boolean,console
 };
 vm.createContext(context);
 vm.runInContext(fnCode+';this.collection=labelInvoiceCollection;',context);
 const result=await context.collection(order);
 return JSON.parse(JSON.stringify(result));
}
(async()=>{
 const base={delivery_payment_type:'product_paid_delivery_cod',delivery_fee:5000,delivery_currency:'IQD',is_external_shipping_collector:false,external_shipping_fee:0};
 assert.deepEqual(await run(base),{type:'product_paid_delivery_cod',amounts:[{amount:5000,currency:'IQD'}]},'delivery-only 5,000, even if canonical order read is RLS-blocked');
 assert.deepEqual(await run(base,{delivery_payment_type:'product_paid_delivery_cod',delivery_fee:5000,external_shipping_fee:0}),{type:'product_paid_delivery_cod',amounts:[{amount:5000,currency:'IQD'}]});
 assert.deepEqual(await run({...base,delivery_payment_type:'paid_prepaid'}),{type:'paid_prepaid',amounts:[]});
 assert.equal((await run({...base,delivery_payment_type:'cod_full'})).amounts,null,'full COD is not a vendor subtotal');
 assert.equal((await run({...base,delivery_fee:null})).amounts,null,'unknown shipping fee must warn');
 assert.equal((await run({...base,is_external_shipping_collector:undefined},{external_shipping_fee:5000})).amounts,null,'unattributed external shipping must warn');
 assert.deepEqual(await run({...base,is_external_shipping_collector:true,external_shipping_fee:2000,external_shipping_currency:'USD'}),{type:'product_paid_delivery_cod',amounts:[{amount:5000,currency:'IQD'},{amount:2000,currency:'USD'}]});
 assert.equal((await run(base,{delivery_payment_type:'cod_full'})).amounts,null,'mode conflict must warn');
 console.log('Vendor scoped label collection tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});
