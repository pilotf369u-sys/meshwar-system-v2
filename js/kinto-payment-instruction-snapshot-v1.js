/* KINTO manual payment instructions: isolated idempotency and snapshot builder.
 * In-memory pure processing ONLY. A real server MUST enforce unique request keys
 * transactionally and persist an immutable audit row before any message is sent.
 * Never treat an instruction, receipt screenshot, or customer click as paid.
 */
(function(root,factory){const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.KintoPaymentInstructionSnapshotV1=api;
})(typeof globalThis!=='undefined'?globalThis:null,function(){
 'use strict';
 const modes=new Set(['card_full','goods_now_shipping_cod','full_cod']);
 const channels=new Set(['whatsapp','internal_chat']);
 function validText(value,max=160){
  if(typeof value!=='string'||!value.trim()||value.length>max||/[\x00-\x1f\x7f]/.test(value))throw Error('INVALID_SNAPSHOT_FIELD');
  return value.trim();
 }
 function make(request){
  if(!request||!request.employeeAuthorized||!request.invoiceAuthorized||!request.orderEligible)throw Error('AUTHORIZATION_REQUIRED');
  const orderCode=validText(request.orderCode,40),invoiceVersion=validText(request.invoiceVersion,100);
  if(!/^(?:KN|MW)-[0-9]{4,12}$/.test(orderCode))throw Error('INVALID_ORDER_CODE');
  if(!modes.has(request.mode)||!channels.has(request.channel))throw Error('INVALID_INSTRUCTION_MODE');
  const requestId=validText(request.requestId,128),actorId=validText(request.actorId,128);
  const amount=request.amountMinor;
  if(!Number.isSafeInteger(amount)||amount<0)throw Error('INVALID_INSTRUCTION_AMOUNT');
  const currency=request.currency;
  if(currency!=='IQD'&&currency!=='USD')throw Error('INVALID_INSTRUCTION_CURRENCY');
  if(request.mode==='full_cod'&&amount!==0)throw Error('COD_CANNOT_BE_PREPAID');
  if(request.mode!=='full_cod'&&amount===0)throw Error('TRANSFER_REQUIRES_AMOUNT');
  const c=request.card||null;
  if(request.mode!=='full_cod'&&(!c||!c.id||!c.account_reference||!c.recipient_name))throw Error('APPROVED_CARD_REQUIRED');
  if(request.mode==='full_cod'&&c)throw Error('COD_CANNOT_INCLUDE_CARD');
  const card=c?Object.freeze({id:validText(String(c.id),128),label:validText(String(c.label||'بطاقة التحويل')),
    recipient_name:validText(String(c.recipient_name)),account_reference:validText(String(c.account_reference)),
    image_object_key:c.image_object_key?validText(String(c.image_object_key),240):null}):null;
  const copy=Object.freeze({requestId,actorId,orderCode,invoiceVersion,mode:request.mode,channel:request.channel,
   amountMinor:amount,currency,card,paymentStatusChanged:false,inventoryChanged:false,invoiceChanged:false});
  return copy;
 }
 function inspect(history,request){
  const proposed=make(request);
  const previous=(Array.isArray(history)?history:[]).find(x=>x&&x.requestId===proposed.requestId);
  if(!previous)return {decision:'new',snapshot:proposed};
  const keys=['actorId','orderCode','invoiceVersion','mode','channel','amountMinor','currency'];
  if(keys.some(k=>previous[k]!==proposed[k])||
   String(previous.card?.id||'')!==String(proposed.card?.id||''))throw Error('IDEMPOTENCY_CONFLICT');
  return {decision:'duplicate',snapshot:previous};
 }
 return Object.freeze({make,inspect});
});
