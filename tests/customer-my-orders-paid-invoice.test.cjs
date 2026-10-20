const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('js/customer-my-orders-paid-invoice.js','utf8');
async function scenario(payments,options={}){
 let button,printed,opens=0,calls=[];
 const order={id:'o',total_price:218000,reward_discount_amount:1000,delivery_payment_type:'cod_full',details:{source:'local_cart_bundle'}},before=JSON.stringify(order);
 const box={dataset:{},querySelectorAll:()=>[],appendChild:b=>button=b},modal={style:{display:'flex'}};
 const ctx={window:{openCustomerOrderDetails:async()=>{},KintoPaymentP5V1:{loadPayments:async page=>{calls.push(page);if(options.fail)throw Error('offline');return{payments:page===1&&options.secondPage?[]:payments,pages:options.secondPage?2:1}}},open:()=>{opens++;return{}},KintoBundleV93:{printInvoice:async(o,opts)=>printed={o,opts}}},currentCustomerOrdersGlobal:[order],document:{getElementById:id=>id==='customerOrderDetailsContent'?box:modal,createElement:()=>({dataset:{},style:{}})},MutationObserver:class{observe(){}},console:{warn(){}},alert(){}};
 vm.createContext(ctx);vm.runInContext(source,ctx);await ctx.window.openCustomerOrderDetails(0);
 if(options.close)modal.style.display='none';
 if(button){button.onclick();await Promise.resolve()}
 assert.equal(JSON.stringify(order),before);
 return{button,printed,opens,calls};
}
(async()=>{
 const paid={status:'paid',payment_kind:'cart',orders:[{order_id:'o'}]};
 const success=await scenario([paid],{secondPage:true});
 assert(success.button);assert.equal(success.printed.o.delivery_payment_type,'product_paid_delivery_cod');assert.equal(success.printed.o.total_price,218000);assert.equal(success.printed.o.reward_discount_amount,1000);assert.equal(success.printed.opts.canonicalOnly,true);assert.equal(success.opens,1);assert.deepEqual(success.calls,[1,2]);
 for(const payment of [{...paid,status:'failed'},{...paid,payment_kind:'campaign'},{...paid,orders:[{order_id:'other'}]}])assert.equal((await scenario([payment])).button,undefined);
 assert.equal((await scenario([])).button,undefined);
 assert.equal((await scenario([paid],{fail:true})).button,undefined);
 console.log('PASS My Orders: paid scoped cart only, pagination, manual/failure preservation, no saved order mutation');
})().catch(error=>{console.error(error);process.exit(1)});
