const test=require('node:test'),assert=require('node:assert/strict');
const {prepare,copy,endpoint}=require('../js/kinto-g16-employee-instructions-read-v1.js');
const id='11111111-2222-3333-4444-555555555555',cardId='22222222-3333-4444-5555-666666666666';
function input(extra={}){
 return {employeeSessionToken:'x'.repeat(40),orderId:id,mode:'card_full',cardId,
 invoke:async(name,request)=>{
  assert.equal(name,endpoint);assert.equal(request.body.card_id,cardId);
  return {error:null,data:{ok:true,orderCode:'KN-000160',
   message:'KINTO | تسديد الطلب KN-000160\nالحساب المعتمد: ACCOUNT123',
   card:{id:cardId,account_reference:'ACCOUNT123',recipient_name:'KINTO'},
   amountIncluded:false,requiresEmployeeSend:true,paymentConfirmed:false}};
 },...extra};
}
test('backend-approved bank info is available without inventing an amount',async()=>{
 const r=await prepare(input());
 assert.equal(r.card.id,cardId);assert.equal(r.amountIncluded,false);
 assert.equal(r.employeeMustSend,true);assert.equal(r.paymentConfirmed,false);
});
test('employee copies the prepared instructions but does not send or mark paid',async()=>{
 let text='';const r=await prepare(input());
 const x=await copy(r,{writeText:async m=>{text=m}});
 assert.equal(text,r.message);assert.equal(x.copied,true);
 assert.equal(x.sent,false);assert.equal(x.paymentConfirmed,false);
});
test('no operation without an authorized session or selected bank',async()=>{
 await assert.rejects(()=>prepare(input({employeeSessionToken:'x'})),/EMPLOYEE_SESSION_REQUIRED/);
 await assert.rejects(()=>prepare(input({cardId:''})),/VERIFIED_CARD_ID_REQUIRED/);
});
test('client rejects an unexpected monetary reply or payment-success claim',async()=>{
 const i=input();
 for(const data of [{ok:true,amountIncluded:true},{ok:true,paymentConfirmed:true},
  {ok:true,amountIncluded:false,requiresEmployeeSend:false}]){
  await assert.rejects(()=>prepare({...i,invoke:async()=>({data,error:null})}),
   /APPROVED_INSTRUCTIONS_UNAVAILABLE/);
 }
});
test('client rejects forged or mismatched server bank destination',async()=>{
 const i=input();
 await assert.rejects(()=>prepare({...i,invoke:async()=>({data:{
   ok:true,orderCode:'KN-000160',message:'KINTO KN-000160 approved account: another',
   amountIncluded:false,paymentConfirmed:false,requiresEmployeeSend:true,
   card:{id:'not-approved',account_reference:'OTHER'}},error:null})}),
 /CARD_ACCOUNT_MISMATCH/);
});
