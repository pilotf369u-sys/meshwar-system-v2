const test=require('node:test'),assert=require('node:assert/strict');
const {make,deliveryNotice}=require('../js/kinto-payment-questions-v1.js');
test('discount request is only a customer question, never an applied discount',()=>{
 const r=make({kind:'discount_request',orderCode:'KN-000160',actor:'customer',comment:'هل ممكن تخفيض السعر؟'});
 assert.match(r.text,/طلب مراجعة خصم/);
 assert.equal(r.approvedDiscount,false);
 assert.equal(r.changesInvoice,false);assert.equal(r.changesStatus,false);
 assert.equal(r.changesDeliveryFee,false);assert.equal(r.requiresExistingStaffReview,true);
});
test('shipping inquiry cannot set a delivery fee',()=>{
 const r=make({kind:'delivery_estimate_question',orderCode:'KN-000160',actor:'customer'});
 assert.equal(r.changesDeliveryFee,false);
 assert.match(r.text,/أجور التوصيل/);
});
test('estimated delivery never looks like an approved invoice charge',()=>{
 const e=deliveryNotice({status:'estimate',amountMinor:3000,currency:'IQD'});
 assert.equal(e.confirmed,false);assert.match(e.text,/التقديرية/);
 assert.match(e.text,/غير نهائي/);
});
test('unavailable delivery amount never silently becomes zero',()=>{
 const e=deliveryNotice({status:'unavailable',currency:'IQD'});
 assert.equal(e.confirmed,false);assert.doesNotMatch(e.text,/0 IQD/);
});
test('confirmed delivery is labelled from the approved invoice only',()=>{
 const r=deliveryNotice({status:'confirmed',amountMinor:250,currency:'USD'});
 assert.equal(r.confirmed,true);assert.match(r.text,/2[.]50 USD/);
});
test('reject corrupt values and mixed currency',()=>{
 assert.throws(()=>make({kind:'approved_discount',orderCode:'KN-000160',actor:'customer'}),/INVALID_QUESTION_KIND/);
 assert.throws(()=>deliveryNotice({status:'estimate',amountMinor:300,currency:'TRY'}),/UNSUPPORTED_DELIVERY_CURRENCY/);
 assert.throws(()=>deliveryNotice({status:'estimate',amountMinor:-1,currency:'IQD'}),/INVALID_DELIVERY_AMOUNT/);
});
