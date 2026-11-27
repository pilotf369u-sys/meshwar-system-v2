const test=require('node:test'),assert=require('node:assert/strict');
const {prepare,copy,endpoint}=require('../js/kinto-g16-employee-instructions-read-v1.js');
const id='11111111-2222-3333-4444-555555555555',cardId='22222222-3333-4444-5555-666666666666';
const invoice={orderCode:'KN-000160',version:'2026-11-27T12:00:00Z',
 currency:'IQD',prepaidMinor:233000,goodsMinor:218000,deliveryDueMinor:15000,
 amountMinor:233000,mode:'card_full',source:'server_readonly_v94_parity',
 serverVerified:true,orderEligible:true,amountIncluded:true};
const baseReply=()=>({ok:true,orderCode:'KN-000160',mode:'card_full',
 message:'KINTO | تسديد الطلب KN-000160\nالمبلغ المعتمد 233,000 IQD\nالحساب: ACCOUNT123',
 card:{id:cardId,account_reference:'ACCOUNT123',recipient_name:'KINTO'},
 invoice,amountMinor:233000,currency:'IQD',amountIncluded:true,
 requiresEmployeeSend:true,paymentConfirmed:false});
function input(extra={}){
 return {employeeSessionToken:'x'.repeat(40),orderId:id,mode:'card_full',cardId,
 invoke:async(name,request)=>{
  assert.equal(name,endpoint);assert.equal(request.body.card_id,cardId);
  return {error:null,data:baseReply()};
 },...extra};
}
test('bank account and numeric invoice amount must BOTH be verified by server',async()=>{
 const r=await prepare(input());
 assert.equal(r.card.id,cardId);assert.equal(r.amountMinor,233000);
 assert.equal(r.amountIncluded,true);assert.equal(r.invoice.serverVerified,true);
 assert.equal(r.employeeMustSend,true);assert.equal(r.paymentConfirmed,false);
});
test('employee copies verified instructions only; no automatic send or paid status',async()=>{
 let copied='';const r=await prepare(input());
 const x=await copy(r,{writeText:async text=>{copied=text}});
 assert.equal(copied,r.message);assert.equal(x.copied,true);
 assert.equal(x.sent,false);assert.equal(x.paymentConfirmed,false);
});
test('no operation without employee session or selected bank',async()=>{
 await assert.rejects(()=>prepare(input({employeeSessionToken:'x'})),/EMPLOYEE_SESSION_REQUIRED/);
 await assert.rejects(()=>prepare(input({cardId:''})),/VERIFIED_CARD_ID_REQUIRED/);
});
test('reject unverified, forged, stale or mismatched server invoice amounts',async()=>{
 for(const patch of [
  {amountIncluded:false},{amountMinor:1},
  {invoice:{...invoice,source:'browser'}},
  {invoice:{...invoice,serverVerified:false}},
  {invoice:{...invoice,amountMinor:999}},
  {mode:'goods_now_shipping_cod'},
  {paymentConfirmed:true}
 ]){
  await assert.rejects(()=>prepare(input({invoke:async()=>({data:{...baseReply(),...patch},error:null})})));
 }
});
test('client rejects mismatched bank account id from server response',async()=>{
 await assert.rejects(()=>prepare(input({invoke:async()=>({data:{
  ...baseReply(),card:{id:'not-approved',account_reference:'OTHER'}
 },error:null})})),/CARD_ACCOUNT_MISMATCH/);
});
