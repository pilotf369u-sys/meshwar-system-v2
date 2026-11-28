const test=require('node:test'),assert=require('node:assert/strict');
const {preflight}=require('../js/kinto-manual-dispatch-preflight-v1.js');
const card=(id,patch={})=>({id,label:'بطاقة تجريبية',provider:'مصرف تجريبي',
 method_type:'manual',is_enabled:true,destination_verified_at:'2026-11-24T10:00:00Z',
 recipient_name:'اسم حساب تجريبي',account_reference:'TEST-ACCOUNT-001',image_object_key:'approved-cards/test.webp',...patch});
const invoice={orderCode:'KN-000160',version:'invoice-v3',currency:'IQD',
 prepaidMinor:1500,goodsMinor:1200,deliveryDueMinor:300};
const input=(patch={})=>({employeeAuthorized:true,invoiceAuthorized:true,orderEligible:true,
 mode:'card_full',channel:'whatsapp',invoice,invoiceVersion:'invoice-v3',serverCards:[card('a',{is_default:true}),card('b')],cardId:'a',...patch});
test('full transfer: uses authorized invoice, card and no commerce mutations',()=>{
 const p=preflight(input());assert.equal(p.amountMinor,1500);assert.equal(p.card.id,'a');
 assert.deepEqual(p.operations,[]);assert.equal(p.changesPaymentStatus,false);
 assert.equal(p.changesInventory,false);assert.equal(p.changesInvoice,false);
});
test('employee can choose second enabled and verified card',()=>{
 assert.equal(preflight(input({cardId:'b'})).card.id,'b');
});
test('goods now/shipping at door separates amounts',()=>{
 const p=preflight(input({mode:'goods_now_shipping_cod',channel:'internal_chat'}));
 assert.equal(p.amountMinor,1200);assert.equal(p.deliveryDueMinor,300);assert.equal(p.card.id,'a');
});
test('full COD never carries bank account or card image',()=>{
 const p=preflight(input({mode:'full_cod',cardId:''}));assert.equal(p.card,null);assert.equal(p.amountMinor,0);
 assert.throws(()=>preflight(input({mode:'full_cod'})),/CARD_NOT_ALLOWED_FOR_COD/);
});
test('fail-closed on missing employee, invoice authorization, order state',()=>{
 assert.throws(()=>preflight(input({employeeAuthorized:false})),/EMPLOYEE_SESSION_REQUIRED/);
 assert.throws(()=>preflight(input({invoiceAuthorized:false})),/APPROVED_INVOICE_REQUIRED/);
 assert.throws(()=>preflight(input({orderEligible:false})),/ORDER_NOT_WAITING_FOR_PAYMENT/);
});
test('fail-closed on disabled, unverified, gateway, or unknown cards',()=>{
 for(const patch of [{is_enabled:false},{destination_verified_at:null},{method_type:'gateway'}]){
  assert.throws(()=>preflight(input({serverCards:[card('a',patch)]})),/CARD_NOT_AUTHORIZED/);
 }
 assert.throws(()=>preflight(input({cardId:'unrecognized'})),/CARD_NOT_AUTHORIZED/);
});
test('fail-closed on stale invoice, missing amounts and unsupported currencies',()=>{
 assert.throws(()=>preflight(input({invoiceVersion:'old'})),/STALE_INVOICE/);
 assert.throws(()=>preflight(input({invoice:{...invoice,goodsMinor:null}})),/INVOICE_BREAKDOWN_REQUIRED/);
 assert.throws(()=>preflight(input({invoice:{...invoice,currency:'TRY'}})),/INVOICE_CURRENCY_UNSUPPORTED/);
});
test('reject unknown channels and zero-priced transfers',()=>{
 assert.throws(()=>preflight(input({channel:'email'})),/INVALID_PAYMENT_CHANNEL/);
 assert.throws(()=>preflight(input({invoice:{...invoice,prepaidMinor:0}})),/TRANSFER_AMOUNT_ZERO/);
});
