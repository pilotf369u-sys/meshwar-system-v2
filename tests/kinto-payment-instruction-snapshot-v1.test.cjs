const test=require('node:test'),assert=require('node:assert/strict');
const {make,inspect}=require('../js/kinto-payment-instruction-snapshot-v1.js');
const card={id:'card-a',label:'بطاقة الرافدين التجريبية',recipient_name:'اسم تجريبي',account_reference:'TEST-ACCOUNT-001',image_object_key:'cards/card-a.webp'};
const base={employeeAuthorized:true,invoiceAuthorized:true,orderEligible:true,requestId:'test-request-01',
 actorId:'employee-example',orderCode:'KN-000160',invoiceVersion:'invoice-v1',mode:'card_full',
 channel:'whatsapp',amountMinor:1500,currency:'IQD',card};
test('immutable instruction snapshot has no financial status mutation',()=>{
 const value=make(base);assert.ok(Object.isFrozen(value));assert.ok(Object.isFrozen(value.card));
 assert.equal(value.paymentStatusChanged,false);assert.equal(value.inventoryChanged,false);
 assert.equal(value.invoiceChanged,false);assert.equal(value.amountMinor,1500);
});
test('retry with same request ID returns old immutable snapshot',()=>{
 const old=make(base),decision=inspect([old],base);assert.equal(decision.decision,'duplicate');
 assert.equal(decision.snapshot,old);
});
test('changed card, invoice version, amount or channel with same ID fails closed',()=>{
 const old=make(base);
 for(const patch of [{card:{...card,id:'card-b'}},{invoiceVersion:'invoice-v2'},
   {amountMinor:1600},{channel:'internal_chat'},{orderCode:'KN-000161'}])
  assert.throws(()=>inspect([old],{...base,...patch}),/IDEMPOTENCY_CONFLICT/);
});
test('new instruction requires a new request ID',()=>{
 const old=make(base),out=inspect([old],{...base,requestId:'test-request-02'});
 assert.equal(out.decision,'new');assert.equal(out.snapshot.requestId,'test-request-02');
});
test('cash on delivery never contains a card or prepaid amount',()=>{
 const result=make({...base,mode:'full_cod',card:null,amountMinor:0});
 assert.equal(result.card,null);
 assert.throws(()=>make({...base,mode:'full_cod'}),/COD_CANNOT_BE_PREPAID/);
});
test('missing approvals and unsupported currencies fail closed',()=>{
 for(const patch of [{employeeAuthorized:false},{invoiceAuthorized:false},{orderEligible:false}])
  assert.throws(()=>make({...base,...patch}),/AUTHORIZATION_REQUIRED/);
 assert.throws(()=>make({...base,currency:'TRY'}),/INVALID_INSTRUCTION_CURRENCY/);
 assert.throws(()=>make({...base,card:null}),/APPROVED_CARD_REQUIRED/);
});
