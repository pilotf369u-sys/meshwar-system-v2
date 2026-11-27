/* KINTO G16 employee manual instruction client — isolated and read-only.
 * Requires an authenticated employee session plus an existing Supabase
 * functions.invoke reference. No customer/admin status or price writes.
 * Server MUST return verified account data. No numeric amount is invented.
 */
(function(root,factory){const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.KintoG16EmployeeInstructionsReadV1=api;
})(typeof globalThis!=='undefined'?globalThis:null,function(){
 'use strict';
 const endpoint='kinto-g16-employee-instructions-read-v1';
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const modes=['card_full','goods_now_shipping_cod','full_cod'];
 async function prepare(input){
  if(typeof input?.invoke!=='function')throw Error('SUPABASE_FUNCTION_CLIENT_REQUIRED');
  const token=input.employeeSessionToken,orderId=input.orderId,mode=input.mode;
  if(typeof token!=='string'||token.length<20||token.length>512)throw Error('EMPLOYEE_SESSION_REQUIRED');
  if(typeof orderId!=='string'||!uuid.test(orderId))throw Error('ORDER_ID_REQUIRED');
  if(!modes.includes(mode))throw Error('INVALID_INSTRUCTION_MODE');
  const cardId=mode==='full_cod'?null:input.cardId;
  if(mode!=='full_cod'&&(!cardId||!uuid.test(cardId)))throw Error('VERIFIED_CARD_ID_REQUIRED');
  const {data,error}=await input.invoke(endpoint,{body:{action:'prepare_manual_instructions',
   session_token:token,order_id:orderId,mode,card_id:cardId}});
  if(error||data?.ok!==true||data?.amountIncluded!==false||
   data?.requiresEmployeeSend!==true||data?.paymentConfirmed!==false||
   typeof data.message!=='string'||data.message.length<25||data.message.length>3900||
   !/^(?:KN|MW)-[0-9]{4,12}$/.test(String(data.orderCode||''))||
   !data.message.includes(data.orderCode))
   throw Error('APPROVED_INSTRUCTIONS_UNAVAILABLE');
  if(mode!=='full_cod'&&(!data.card||String(data.card.id)!==cardId||
   typeof data.card.account_reference!=='string'||!data.card.account_reference.trim()))
   throw Error('CARD_ACCOUNT_MISMATCH');
  return Object.freeze({
   message:data.message,orderCode:data.orderCode,mode,
   card:mode==='full_cod'?null:Object.freeze({...data.card}),
   employeeMustSend:true,amountIncluded:false,
   paymentConfirmed:false,changesInvoice:false,changesOrder:false
  });
 }
 async function copy(result,clipboard){
  if(!result||result.employeeMustSend!==true||result.amountIncluded!==false||
   typeof result.message!=='string'||typeof clipboard?.writeText!=='function')
   throw Error('MANUAL_COPY_UNAVAILABLE');
  await clipboard.writeText(result.message);
  return Object.freeze({copied:true,sent:false,paymentConfirmed:false});
 }
 return Object.freeze({prepare,copy,endpoint});
});
