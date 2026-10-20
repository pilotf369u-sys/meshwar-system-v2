const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('js/courier-paid-invoice-v1.js','utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function run({paid=true,fail=false,recheck=true}={}){
 let button,printed,opens=0,closed=0,baseCalls=0,rpcCalls=[];
 const order={id:'o',total_price:218000,reward_discount_amount:1000,delivery_payment_type:'cod_full',details:'{"source":"local_cart_bundle"}',_customer:{name:'Customer'}};
 const before=JSON.stringify(order),actions={querySelector:()=>button||null,appendChild:b=>button=b};
 const ctx={window:{loadDeliveryOrders:async()=>baseCalls++,KintoCourierSessionV149:{read:()=>({token:'courier-session'})},open:()=>{opens++;return{close(){closed++}}},KintoBundleV93:{printInvoice:async(o,opts)=>{printed={o,opts}}}},deliveryOrders:[order],getDeliverySb:async()=>({rpc:async(name,args)=>{rpcCalls.push({name,args});return fail?{error:Error('unavailable')}:{data:paid&&(rpcCalls.length===1||recheck)?[{order_id:'o'}]:[]}}}),parseDetails:JSON.parse,document:{querySelectorAll:()=>[{dataset:{id:'o'},querySelector:()=>actions}],createElement:()=>({dataset:{}})},console:{warn(){}},alert(){}};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 await ctx.window.loadDeliveryOrders();await tick();await tick();
 if(button){button.onclick();assert.equal(opens,1,'popup opens synchronously');await tick();await tick()}
 assert.equal(baseCalls,1);assert.equal(JSON.stringify(order),before);
 assert(rpcCalls.every(call=>call.name==='courier_paid_electronic_invoice_orders_v1'&&call.args.p_session_token==='courier-session'));
 return{button,printed,opens,closed,rpcCalls};
}
(async()=>{
 const result=await run();
 assert(result.button);assert.equal(result.printed.o.delivery_payment_type,'product_paid_delivery_cod');assert.equal(result.printed.o.total_price,218000);assert.equal(result.printed.o.reward_discount_amount,1000);assert.equal(result.printed.opts.canonicalOnly,true);assert.equal(result.rpcCalls.length,2);
 assert.equal((await run({paid:false})).button,undefined);
 assert.equal((await run({fail:true})).button,undefined);
 const reassigned=await run({recheck:false});assert.equal(reassigned.printed,undefined);assert.equal(reassigned.closed,1);
 const sql=fs.readFileSync('sql/courier-paid-invoice-proof-v1.sql','utf8');
 assert(sql.includes("private.kinto_staff_actor_v1('courier',p_session_token)"));
 assert(sql.includes('private.kinto_order_visible_v1(to_jsonb(o),actor)'));
 assert(sql.includes("a.status='succeeded'"));assert(sql.includes("p.status='paid' and p.payment_kind='cart'"));
 assert(!/\b(?:update|delete|insert)\s+(?:into\s+|from\s+)?(?:public\.|private\.)?(?:orders|kinto_payments_p5)\b/i.test(sql));
 console.log('PASS assigned paid courier invoice; manual/error paths unchanged; recheck assignment; no order mutation');
})().catch(error=>{console.error(error);process.exit(1)});
