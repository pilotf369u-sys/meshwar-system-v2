const test=require('node:test'),assert=require('node:assert/strict');
const {prepare,send}=require('../js/kinto-g16-employee-chat-handoff-v1.js');
const base=(more={})=>({
 employeeConfirmed:true,employeeSessionToken:'t'.repeat(40),
 customerId:'11111111-2222-3333-4444-555555555555',orderCode:'KN-000160',
 approvedContextVerified:true,orderCustomerVerified:true,cardDestinationVerified:true,
 invoiceVersionVerified:true,instructionText:'KINTO — تعليمات التحويل المعتمدة للطلب KN-000160\nاسم الحساب: صاحب حساب تجريبي',
 ...more
});
test('existing V61 RPC receives message text only after explicit employee send',async()=>{
 let called=0;
 const sent=await send(base({rpc:async(name,args)=>{
  called++;assert.equal(name,'employee_chat_send_v61');assert.equal(args.p_file_url,null);
  assert.equal(args.p_customer_id,base().customerId);
  assert.match(args.p_message,/KN-000160/);
  return {data:{id:'m1'},error:null};
 }}));
 assert.equal(called,1);assert.equal(sent.sentToChat,true);
 assert.equal(sent.paymentConfirmed,false);assert.equal(sent.orderStatusChanged,false);
 assert.equal(sent.invoiceModified,false);assert.equal(sent.stockDeducted,false);
});
test('no send without an explicit employee confirmation',async()=>{
 let called=0;
 await assert.rejects(()=>send(base({employeeConfirmed:false,rpc:async()=>{called++;return{data:{id:'m'}}}})),
 /EMPLOYEE_CONFIRMATION_REQUIRED/);
 assert.equal(called,0);
});
test('no send with stale or forged customer/order/invoice approval flags',async()=>{
 for(const key of ['approvedContextVerified','orderCustomerVerified',
  'cardDestinationVerified','invoiceVersionVerified']){
  let invoked=false;
  await assert.rejects(()=>send(base({[key]:false,rpc:async()=>{invoked=true;return {data:{id:'m'}}}})),
   /SERVER_PAYMENT_CONTEXT_REQUIRED/);
  assert.equal(invoked,false);
 }
});
test('mismatched order code is blocked before existing chat RPC',()=>{
 assert.throws(()=>prepare(base({instructionText:'KING order KN-000161 data sent manually'})),
  /INSTRUCTION_ORDER_MISMATCH/);
});
test('missing customer id or employee session is blocked',()=>{
 assert.throws(()=>prepare(base({customerId:'not-a-uuid'})),/CUSTOMER_ID_INVALID/);
 assert.throws(()=>prepare(base({employeeSessionToken:'bad'})),/EMPLOYEE_SESSION_REQUIRED/);
});
test('chat transport failure does not claim successful delivery or payment',async()=>{
 await assert.rejects(()=>send(base({rpc:async()=>({error:{message:'db down'},data:null})})),/CHAT_SEND_FAILED/);
 await assert.rejects(()=>send(base({rpc:async()=>({error:null,data:{}})})),/CHAT_SEND_UNCONFIRMED/);
});
