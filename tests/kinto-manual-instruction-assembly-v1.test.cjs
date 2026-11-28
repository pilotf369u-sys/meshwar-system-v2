const test=require('node:test'),assert=require('node:assert/strict');
const {assemble}=require('../js/kinto-manual-instruction-assembly-v1.js');
const card={id:'approved-demo-a',label:'بطاقة تجريبية',provider:'مصرف تجريبي',
 recipient_name:'اسم حساب تجريبي',account_reference:'TEST-ACCOUNT-001',
 method_type:'manual',is_enabled:true,destination_verified_at:'2026-11-25T11:00:00Z',is_default:true};
const invoice={orderCode:'KN-000160',currency:'IQD',version:'invoice-readonly-v1',
 prepaidMinor:1500,goodsMinor:1200,deliveryDueMinor:300};
const base=(patch={})=>({serverAuthorized:true,employeeAuthorized:true,orderEligible:true,
 invoiceAuthorized:true,approvedInvoice:invoice,orderCode:invoice.orderCode,
 invoiceVersion:invoice.version,serverCards:[card],selectedCardId:card.id,
 requestId:'demo-request-123',actorId:'employee-demo',
 mode:'card_full',channel:'whatsapp',...patch});
test('full bank transfer is a non-mutating preview of already-approved total',()=>{
 const result=assemble(base());assert.equal(result.transferAmountMinor,1500);
 assert.equal(result.selectedCard.id,card.id);
 assert.equal(result.marksOrderPaid,false);assert.equal(result.updatesStock,false);
 assert.equal(result.sendsMessage,false);assert.equal(result.changesInvoice,false);
 assert.equal(result.changesCustomerPage,false);
 assert.match(result.messageText,/1,500 IQD/);
});
test('product-only bank transfer displays original delivery due separately',()=>{
 const r=assemble(base({mode:'goods_now_shipping_cod',channel:'internal_chat'}));
 assert.equal(r.transferAmountMinor,1200);assert.equal(r.shippingAtDoorMinor,300);
 assert.match(r.messageText,/300 IQD/);
});
test('full cash at door never exposes bank details',()=>{
 const r=assemble(base({mode:'full_cod',selectedCardId:null}));
 assert.equal(r.transferAmountMinor,0);assert.equal(r.selectedCard,null);
 assert.doesNotMatch(r.messageText,/TEST-ACCOUNT/);
});
test('fail closed if invoice order or version changed',()=>{
 assert.throws(()=>assemble(base({orderCode:'KN-000161'})),/INVOICE_ORDER_MISMATCH/);
 assert.throws(()=>assemble(base({invoiceVersion:'old'})),/STALE_INVOICE/);
});
test('fail closed on disabled card and changed account details',()=>{
 assert.throws(()=>assemble(base({serverCards:[{...card,is_enabled:false}]})),/NO_APPROVED_TRANSFER_CARD/);
 assert.throws(()=>assemble(base({serverCards:[{...card,recipient_name:''}]})),/NO_APPROVED_TRANSFER_CARD/);
});
test('no trusting browser-only authorization or missing invoice',()=>{
 assert.throws(()=>assemble(base({serverAuthorized:false})),/SERVER_AUTHORIZATION_REQUIRED/);
 assert.throws(()=>assemble(base({employeeAuthorized:false})),/SERVER_AUTHORIZATION_REQUIRED/);
 assert.throws(()=>assemble(base({approvedInvoice:null})),/INVOICE_NOT_AVAILABLE/);
});
test('USD cents preserved exactly, no re-pricing or conversion',()=>{
 const usd={...invoice,currency:'USD',prepaidMinor:145,goodsMinor:145,deliveryDueMinor:0};
 const r=assemble(base({approvedInvoice:usd}));assert.equal(r.transferAmountMinor,145);
 assert.match(r.messageText,/1[.]45 USD/);
});
test('invalid/mixed currency fails closed',()=>{
 assert.throws(()=>assemble(base({approvedInvoice:{...invoice,currency:'TRY'}})),/INVOICE_CURRENCY_UNSUPPORTED/);
});
