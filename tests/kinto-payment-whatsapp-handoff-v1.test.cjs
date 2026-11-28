const test=require('node:test'),assert=require('node:assert/strict');
const {build,normalizePhone}=require('../js/kinto-payment-whatsapp-handoff-v1.js');
test('valid international phone and approved message produce manual handoff only',()=>{
 const r=build('+964 770 123 4567','تسوّق بثقة مع KINTO 💚 — رقم الطلب KN-000160');
 assert.equal(r.recipient,'9647701234567');
 assert.match(r.url,/^https:\/\/wa\.me\/9647701234567\?text=/);
 assert.equal(r.requiresEmployeeSend,true);assert.equal(r.imageAutoAttached,false);
 assert.equal(r.ordersModified,false);assert.equal(r.paymentConfirmed,false);
});
test('strictly reject phone injection and malformed recipient numbers',()=>{
 for(const phone of ['','+00','+964123abc','+9647701234567?text=hack','javascript:alert(1)','123','+964\n7701234567'])
 assert.throws(()=>normalizePhone(phone),/INVALID_CUSTOMER_PHONE/);
});
test('strictly reject missing or malformed message',()=>{
 for(const message of ['', 'short', 'x'.repeat(3901), 'hello world\u0000'])
 assert.throws(()=>build('+9647701234567',message),/INVALID_PAYMENT_MESSAGE/);
});
test('customer text is URL encoded and never executed or sent automatically',()=>{
 const r=build('+9647701234567','KINTO تعليمات الدفع & رقم الطلب KN-000160');
 assert.match(r.url,/%26/);assert.doesNotMatch(r.url,/& رقم/);
 assert.equal(decodeURIComponent(r.url.split('?text=')[1]),r.message);
});
