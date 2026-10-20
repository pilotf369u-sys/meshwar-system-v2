const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('js/branch-collection-display-v1.js','utf8'),html=fs.readFileSync('branch-dashboard.html','utf8');
function extract(name){const start=html.indexOf('function '+name+'('),end=html.indexOf('function ',start+9);return html.slice(start,end)}
let fail=false,bad=false,batches=[];
const ctx={window:{KintoBranchSessionV148:{read:()=>({token:'branch-session'})},KintoCouponFinanceV1:{goods:o=>Math.max(0,Number(o.total_price)-Number(o.reward_discount_amount||0))}},console:{warn(){}},esc:String,getSb:async()=>({rpc:async(name,args)=>{assert.equal(name,'branch_paid_collection_orders_v1');assert.equal(args.p_session_token,'branch-session');batches.push(args.p_order_ids.length);return fail?{error:Error('offline')}:{data:bad?null:args.p_order_ids.filter(id=>id.startsWith('paid')).map(order_id=>({order_id}))}}})};
vm.createContext(ctx);
vm.runInContext(source+'\n'+html.match(/const PAYMENT_TYPES[^;]+;/)[0]+['payType','doorCollection','netCustody','money','branchPaymentStatus'].map(extract).join('\n'),ctx);
(async()=>{
 const orders=[{id:'paid-1',delivery_payment_type:'cod_full',total_price:218000,reward_discount_amount:1000,delivery_fee:5000},{id:'manual',delivery_payment_type:'cod_full',total_price:218000,reward_discount_amount:1000,delivery_fee:5000},{id:'prepaid',delivery_payment_type:'paid_prepaid',total_price:218000,delivery_fee:5000}],before=JSON.stringify(orders),rows=await ctx.window.KintoBranchCollectionV1.prepare(orders);
 assert.equal(ctx.doorCollection(rows[0]),5000);assert.equal(ctx.branchPaymentStatus(rows[0]),'البضاعة مدفوعة إلكترونياً — حصّل أجرة التوصيل فقط');assert.equal(rows[0].delivery_payment_type,'cod_full','display proof must not alter saved/editable type');
 assert.equal(ctx.doorCollection(rows[1]),222000);assert(ctx.branchPaymentStatus(rows[1]).includes('حصّل المبلغ الموضح'));
 assert.equal(ctx.doorCollection(rows[2]),0);assert(ctx.branchPaymentStatus(rows[2]).includes('لا تحصّل أي مبلغ'));assert.equal(JSON.stringify(orders),before);
 batches=[];await ctx.window.KintoBranchCollectionV1.prepare(Array.from({length:205},(_,i)=>({...orders[0],id:'paid-'+i})));assert.deepEqual(batches,[100,100,5]);
 fail=true;const unknown=await ctx.window.KintoBranchCollectionV1.prepare(orders);assert.equal(ctx.doorCollection(unknown[0]),null);assert.equal(ctx.netCustody(unknown[0]),null);assert.equal(ctx.money(null,'IQD'),'بانتظار التحقق');assert(ctx.branchPaymentStatus(unknown[0]).includes('لا تحصّل المبلغ قبل التحقق'));assert.equal(ctx.doorCollection(unknown[2]),0);
 fail=false;bad=true;assert.equal(ctx.doorCollection((await ctx.window.KintoBranchCollectionV1.prepare(orders))[0]),null);
 assert(!source.includes('printInvoice'));assert(!source.includes('window.open'));
 assert(html.includes('orders=await window.KintoBranchCollectionV1.prepare(data||[])'));
 assert(html.includes('for(const o of await window.KintoBranchCollectionV1.prepare(data||[]))'));
 assert(html.includes('renderScanCard((await window.KintoBranchCollectionV1.prepare([data]))[0])'));
 assert(html.includes('invoiceButton:false,storeInvoiceButtons:false'));
 assert(extract('saveOrder').includes('delivery_payment_type:payment'));
 assert(extract('createSettlements').includes('list.map(o=>cloudId(o.id))'));
 const sql=fs.readFileSync('sql/branch-paid-collection-proof-v1.sql','utf8');assert(sql.includes("private.kinto_staff_actor_v1('branch',p_session_token)"));assert(sql.includes('private.kinto_order_visible_v1(to_jsonb(o),actor)'));
 console.log('PASS branch paid/manual/prepaid collection, no edit type mutation, proof batching, failures and no invoice action');
})().catch(error=>{console.error(error);process.exit(1)});
