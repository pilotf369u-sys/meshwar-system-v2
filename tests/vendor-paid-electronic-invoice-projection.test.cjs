const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');

const source=fs.readFileSync(path.join(__dirname,'..','js/vendor-v94-multistore-orders.js'),'utf8');
const start=source.indexOf('async function openPaidElectronicVendorInvoice');
const end=source.indexOf('\nfunction invoiceDate',start);
assert(start>=0&&end>start,'actual V95 invoice route helper is present');

function setup({type='cod_full',proof=[],storeId='store-1',sessionToken='vendor-session'}={}){
  let call=null,printed=null;
  const order={id:'kn-legacy',order_code:'KN-000123',customer_id:'customer-1',status:'تم التسديد',total_price:217000,currency:'IQD',delivery_payment_type:type,reward_discount_amount:1000,reward_discount_currency:'IQD',details:{source:'local_store',store_id:storeId,store_name:'KINTO',customer:{name:'عميل'},items:[
    {store_id:'store-1',store_name:'KINTO',product_id:'p1',product_name:'متجرنا',quantity:1,unit_price_local:218000,line_total_local:218000,currency:'IQD'},
    {store_id:'store-2',store_name:'متجر آخر',product_id:'p2',product_name:'بيانات متجر آخر',quantity:1,unit_price_local:999999,line_total_local:999999,currency:'IQD'},
  ]}};
  const context={
    parse(value){return value&&typeof value==='object'?value:{}},
    session(){return sessionToken?{token:sessionToken}:null},
    runtime:{getStore:()=>({id:'store-1',store_name:'KINTO'}),sb:{rpc:async(name,args)=>{call={name,args};return{data:proof,error:null}}}},
    hydrateVendorCanonicalInvoice:async()=>({delivery_payment_type:type,total_price:217000,currency:'IQD',reward_discount_amount:1000,reward_discount_currency:'IQD'}),
    window:{KintoBundleV93:{printInvoice:async(invoiceOrder,options)=>{printed={invoiceOrder,options}}}},
  };
  vm.createContext(context);vm.runInContext(source.slice(start,end),context);
  return{context,order,get call(){return call},get printed(){return printed}};
}

(async()=>{
  {
    const test=setup({proof:[{order_id:'kn-legacy'}]});
    assert.equal(await test.context.openPaidElectronicVendorInvoice(test.order),true);
    assert.equal(test.call.name,'vendor_paid_electronic_invoice_orders_v1');
    assert.deepEqual(JSON.parse(JSON.stringify(test.call.args)),{p_session_token:'vendor-session',p_order_ids:['kn-legacy']});
    const invoice=test.printed.invoiceOrder;
    assert.equal(invoice.delivery_payment_type,'product_paid_delivery_cod');
    assert.equal(invoice.total_price,217000);
    assert.deepEqual(invoice.details.items.map(x=>x.product_name),['متجرنا'],'projection excludes every other-store line');
    assert.deepEqual(JSON.parse(JSON.stringify(test.printed.options)),{canonicalOnly:true});
    assert.equal(test.order.delivery_payment_type,'cod_full','saved legacy order remains unchanged');
  }
  {
    const test=setup({proof:[{order_id:'kn-legacy'}]});
    test.order.details.source='local_cart_bundle';
    test.order.details.checkout_contract='independent_vendor_orders';
    test.order.details.multi_store=false;
    assert.equal(await test.context.openPaidElectronicVendorInvoice(test.order),true,'legacy per-store bundle contract remains supported');
  }
  {
    const test=setup({proof:[{order_id:'kn-legacy'}]});
    test.order.details.source='local_cart_bundle';
    test.order.details.checkout_contract='shared_multi_store';
    test.order.details.multi_store=true;
    await assert.rejects(test.context.openPaidElectronicVendorInvoice(test.order),/إثبات ملكية المتجر/,'unscoped multi-store parent is rejected');
    assert.equal(test.printed,null);
  }
  {
    const test=setup({proof:[]});
    assert.equal(await test.context.openPaidElectronicVendorInvoice(test.order),false,'an ordinary manual cod_full order gets no electronic invoice');
    assert.equal(test.printed,null);
  }
  {
    const test=setup({type:'product_paid_delivery_cod',proof:[{order_id:'kn-legacy'}]});
    assert.equal(await test.context.openPaidElectronicVendorInvoice(test.order),true,'new electronic order uses the shared invoice');
    assert.equal(test.call.name,'vendor_paid_electronic_invoice_orders_v1','new electronic invoice also requires server payment proof');
    assert.deepEqual(test.printed.invoiceOrder.details.items.map(x=>x.product_name),['متجرنا']);
  }
  {
    const test=setup({type:'product_paid_delivery_cod',proof:[]});
    assert.equal(await test.context.openPaidElectronicVendorInvoice(test.order),false,'an unverified new goods-paid stamp cannot open an electronic invoice');
    assert.equal(test.printed,null);
  }
  {
    const test=setup({proof:[],sessionToken:''});
    assert.equal(await test.context.openPaidElectronicVendorInvoice(test.order),false,'no vendor session cannot verify legacy KP payment');
    assert.equal(test.printed,null);
  }
  {
    const test=setup({proof:[{order_id:'kn-legacy'}],storeId:'other-store'});
    await assert.rejects(test.context.openPaidElectronicVendorInvoice(test.order),/إثبات ملكية المتجر/);
    assert.equal(test.printed,null);
  }
  console.log('PASS vendor invoice projection: legacy paid-cart KP and new e-payments use the shared canonical invoice; manual/unverified rows remain unchanged and other-store lines are removed.');
})().catch(error=>{console.error(error);process.exitCode=1});
