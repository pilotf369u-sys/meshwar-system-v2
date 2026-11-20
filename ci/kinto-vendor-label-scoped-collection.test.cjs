const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('js/vendor-v94-multistore-orders.js','utf8');
const begin=source.indexOf('async function labelInvoiceCollection(order){');
const end=source.indexOf('window.KintoVendorLabelInvoiceCollection=labelInvoiceCollection;',begin);
assert(begin>=0&&end>begin,'vendor label collection function is present');
const fnCode=source.slice(begin,end);
const order={id:'s1',_v95SegmentId:'s1',_v95OrderId:'parent1',currency:'IQD',delivery_currency:'IQD'};
async function run(shipping,canonical={},opts={}){
 const calls=[];
 const context={
  session:()=>({token:'test'}),
  detailCache:new Map([['s1',{store_id:'storeA',subtotal_local:18000}]]),
  shippingControlCache:new Map([['s1',shipping]]),
  hydrateVendorCanonicalInvoice:async()=>canonical,
  labelStoreInvoiceTotal:async()=>opts.invoiceTotal??'',
  runtime:{sb:{rpc:async(name)=>{calls.push(name);return {data:shipping}}}},
  parse:x=>typeof x==='object'&&x?x:(()=>{try{return JSON.parse(x||'{}')}catch{return{}}})(),
  window:{KintoBundleV93:{storeGroups:()=>opts.groups||[]},KintoUnifiedShippingLabel:{invoiceCollection:()=>opts.calculated||{type:'cod_full',amounts:null}}},String,Number,Boolean,console
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

 const cod={...base,delivery_payment_type:'cod_full'};
 const finalInvoice={type:'cod_full',amounts:[{amount:14000,currency:'IQD'}]};
 assert.deepEqual(await run(cod,{}, {invoiceTotal:'14,000 IQD'}),finalInvoice,
  'KN-000152: full COD label reads the exact 14,000 IQD already displayed on vendor invoice');
 assert.deepEqual(await run(cod,{}, {invoiceTotal:'13,000 IQD'}),
  {type:'cod_full',amounts:[{amount:13000,currency:'IQD'}]},
  'invoice grand after discount is used without applying discount twice');
 assert.equal((await run(cod,{}, {invoiceTotal:''})).amounts,null,'missing invoice total stays unconfirmed');
 assert.equal((await run(cod,{}, {invoiceTotal:'14,000 IQD + 5 USD'})).amounts,null,'mixed invoice total cannot be misread as one currency');
 assert.equal((await run(cod,{}, {invoiceTotal:'14,000 USD'})).amounts,null,'wrong currency stays unconfirmed');
 assert.equal((await run(cod,{total_price:20000}, {invoiceTotal:'14,000 IQD'})).amounts,null,'parent goods mismatches vendor subtotal');
 assert.equal((await run(cod,{details:{items:[{store_id:'other'}]}}, {invoiceTotal:'14,000 IQD'})).amounts,null,'multi-store parent rejected');
 assert.equal((await run(cod,{}, {invoiceTotal:'not-a-number'})).amounts,null,'malformed invoice total stays unconfirmed');

 console.log('Vendor scoped label collection tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});
