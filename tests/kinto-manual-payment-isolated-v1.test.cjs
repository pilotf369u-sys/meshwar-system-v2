const test=require('node:test');const assert=require('node:assert/strict');
const images=require('../js/kinto-card-image-prepare-v1.js');
const messages=require('../js/kinto-manual-payment-message-v1.js');
const card={id:'test-card-a',label:'بطاقة تجريبية',recipient_name:'اسم حساب تجريبي',account_reference:'TEST-ACCOUNT-001'};
const approvedInvoice={orderCode:'KN-000160',currency:'IQD',prepaidMinor:1500,goodsMinor:1200,deliveryDueMinor:300};
test('card images accept known image MIME and reject SVG, PDF, huge files',()=>{
 assert.equal(images.validate({type:'image/jpeg',size:12000}),true);
 assert.equal(images.validate({type:'image/webp',size:3000}),true);
 assert.throws(()=>images.validate({type:'image/svg+xml',size:2000}),/UNSUPPORTED/);
 assert.throws(()=>images.validate({type:'application/pdf',size:2000}),/UNSUPPORTED/);
 assert.throws(()=>images.validate({type:'image/png',size:6*1024*1024}),/SOURCE_SIZE/);
});
test('image scaling never upscales, caps maximum edge',()=>{
 assert.deepEqual(images.scaledDimensions(2400,1600),{width:1200,height:800});
 assert.deepEqual(images.scaledDimensions(400,200),{width:400,height:200});
 assert.throws(()=>images.scaledDimensions(0,100),/INVALID_IMAGE/);
});
test('full transfer uses approved invoice amount and includes card and reassurance',()=>{
 const x=messages.compose({mode:'card_full',card,approvedInvoice});
 assert.equal(x.amountMinor,1500);assert.equal(x.cardId,'test-card-a');
 assert.match(x.text,/1,500 IQD/);
 assert.match(x.text,/بعد مطابقة اسم ورقم الحساب عند التحويل/);
 assert.match(x.text,/لن نطلب منك مطلقاً كلمة المرور/);
});
test('goods-only transfer uses approved goods amount and states delivery due separately',()=>{
 const x=messages.compose({mode:'goods_now_shipping_cod',card,approvedInvoice});
 assert.equal(x.amountMinor,1200);assert.match(x.text,/1,200 IQD/);
 assert.match(x.text,/300 IQD/);assert.equal(x.requiresCard,true);
});
test('full COD has no card or prepaid amount',()=>{
 const x=messages.compose({mode:'full_cod',approvedInvoice});assert.equal(x.requiresCard,false);
 assert.equal(x.amountMinor,0);assert.doesNotMatch(x.text,/TEST-ACCOUNT/);
});
test('reject missing card, broken invoice and mixed unsupported currency',()=>{
 assert.throws(()=>messages.compose({mode:'card_full',approvedInvoice}),/APPROVED_CARD_REQUIRED/);
 assert.throws(()=>messages.compose({mode:'card_full',card,approvedInvoice:{...approvedInvoice,currency:'TRY'}}),/INVALID_APPROVED_INVOICE_AMOUNT/);
 assert.throws(()=>messages.compose({mode:'card_full',card,approvedInvoice:{...approvedInvoice,goodsMinor:null}}),/MISSING_APPROVED_INVOICE_BREAKDOWN/);
});
test('USD cents are displayed without whole-dollar rounding',()=>{
 const x=messages.compose({mode:'card_full',card,approvedInvoice:{orderCode:'KN-000160',currency:'USD',prepaidMinor:145,goodsMinor:145,deliveryDueMinor:0}});
 assert.match(x.text,/1\.45 USD/);
});
