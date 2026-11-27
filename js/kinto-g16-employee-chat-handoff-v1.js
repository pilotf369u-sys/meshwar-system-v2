/* KINTO G16 employee instruction handoff via EXISTING V61 chat RPC.
 * ISOLATED MODULE, NOT LOADED BY CURRENT APP. No new DB tables or mutations.
 * This is a message send only — it never indicates payment success.
 * Caller must only supply the server-approved instruction text and verified
 * customerId/session after a trusted invoice authorization.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.KintoG16EmployeeChatHandoffV1=api;
})(typeof globalThis!=='undefined'?globalThis:null,function(){
 'use strict';
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const CODE=/^(?:KN|MW)-[0-9]{4,12}$/;
 function prepare(input){
  if(!input||input.employeeConfirmed!==true)throw Error('EMPLOYEE_CONFIRMATION_REQUIRED');
  const token=input.employeeSessionToken;
  if(typeof token!=='string'||token.length<20||token.length>512)
   throw Error('EMPLOYEE_SESSION_REQUIRED');
  const customerId=String(input.customerId||'');
  if(!UUID.test(customerId))throw Error('CUSTOMER_ID_INVALID');
  const orderCode=String(input.orderCode||'');
  if(!CODE.test(orderCode))throw Error('ORDER_CODE_INVALID');
  if(input.approvedContextVerified!==true||input.orderCustomerVerified!==true||
   input.cardDestinationVerified!==true||input.invoiceVersionVerified!==true)
   throw Error('SERVER_PAYMENT_CONTEXT_REQUIRED');
  const message=input.instructionText;
  if(typeof message!=='string'||message.length<20||message.length>3900||
   /[\u0000-\u001f\u007f]/.test(message.replace(/\n/g,'')))
   throw Error('INSTRUCTION_TEXT_INVALID');
  if(!message.includes(orderCode))throw Error('INSTRUCTION_ORDER_MISMATCH');
  return Object.freeze({session:token,customerId,orderCode,message,
   action:'employee_chat_send_v61',file_url:null,
   changesOrder:false,marksPaid:false,changesInvoice:false});
 }
 async function send(input){
  if(typeof input?.rpc!=='function')throw Error('EXISTING_CHAT_RPC_REQUIRED');
  // A second explicit confirmation at the moment of actual sending.
  const operation=prepare(input);
  const {data,error}=await input.rpc(operation.action,{
   p_session_token:operation.session,
   p_customer_id:operation.customerId,
   p_message:operation.message,
   p_file_url:null
  });
  if(error)throw Error('CHAT_SEND_FAILED');
  if(!data||typeof data!=='object'||!data.id)throw Error('CHAT_SEND_UNCONFIRMED');
  return Object.freeze({messageId:String(data.id),sentToChat:true,
   paymentConfirmed:false,orderStatusChanged:false,invoiceModified:false,
   stockDeducted:false});
 }
 return Object.freeze({prepare,send});
});
