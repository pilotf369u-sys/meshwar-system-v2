/* KINTO manual-payment dispatch preflight V1 — isolated, pure, fail-closed.
 * This is a contract test helper, NOT a deployed authorization endpoint.
 * The production endpoint MUST authenticate the employee, fetch invoice and
 * approved cards server-side, then call this pure function. No order writes.
 */
(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.KintoManualDispatchPreflightV1=api;
})(typeof globalThis!=='undefined'?globalThis:null,function(){
 'use strict';
 const modes=Object.freeze(['card_full','goods_now_shipping_cod','full_cod']);
 const channels=Object.freeze(['whatsapp','internal_chat']);
 function clean(value,max=160){const v=String(value??'').trim();if(!v||v.length>max||/[\x00-\x1f\x7f]/.test(v))throw Error('INVALID_PAYMENT_TEXT');return v}
 function preflight(input){
  if(!input||input.employeeAuthorized!==true)throw Error('EMPLOYEE_SESSION_REQUIRED');
  if(input.invoiceAuthorized!==true)throw Error('APPROVED_INVOICE_REQUIRED');
  if(input.orderEligible!==true)throw Error('ORDER_NOT_WAITING_FOR_PAYMENT');
  if(!modes.includes(input.mode))throw Error('INVALID_PAYMENT_MODE');
  if(!channels.includes(input.channel))throw Error('INVALID_PAYMENT_CHANNEL');
  const invoice=input.invoice;
  if(!invoice||invoice.currency!=='IQD'&&invoice.currency!=='USD')throw Error('INVOICE_CURRENCY_UNSUPPORTED');
  if(!/^(KN|MW)-[0-9]{4,12}$/.test(String(invoice.orderCode||'')))throw Error('INVALID_ORDER_CODE');
  for(const k of ['prepaidMinor','goodsMinor','deliveryDueMinor']){
   if(!Number.isSafeInteger(invoice[k])||invoice[k]<0)throw Error('INVOICE_BREAKDOWN_REQUIRED');
  }
  if(input.invoiceVersion!=null&&String(input.invoiceVersion)!==String(invoice.version))throw Error('STALE_INVOICE');
  let selected=null;
  if(input.mode!=='full_cod'){
   const cards=Array.isArray(input.serverCards)?input.serverCards:[];
   const eligible=cards.filter(c=>c&&c.method_type==='manual'&&c.is_enabled===true&&
     c.destination_verified_at&&Number.isFinite(Date.parse(c.destination_verified_at))&&
     String(c.id||'').trim()&&String(c.account_reference||'').trim()&&String(c.recipient_name||'').trim());
   selected=eligible.find(c=>String(c.id)===String(input.cardId||''))||
     (input.cardId?null:eligible.find(c=>c.is_default===true)||eligible[0]);
   if(!selected)throw Error('CARD_NOT_AUTHORIZED');
   const amount=input.mode==='card_full'?invoice.prepaidMinor:invoice.goodsMinor;
   if(amount<=0)throw Error('TRANSFER_AMOUNT_ZERO');
  }else if(input.cardId)throw Error('CARD_NOT_ALLOWED_FOR_COD');
  // A preview token/record must never be interpreted as proof of payment.
  return Object.freeze({
   mode:input.mode,channel:input.channel,orderCode:invoice.orderCode,
   currency:invoice.currency,invoiceVersion:String(invoice.version??''),
   amountMinor:input.mode==='full_cod'?0:input.mode==='card_full'?invoice.prepaidMinor:invoice.goodsMinor,
   deliveryDueMinor:input.mode==='goods_now_shipping_cod'?invoice.deliveryDueMinor:0,
   card:selected?Object.freeze({
    id:clean(selected.id,128),label:clean(selected.label||'بطاقة التحويل'),
    provider:clean(selected.provider||'مصرف معتمد'),recipient_name:clean(selected.recipient_name),
    account_reference:clean(selected.account_reference),
    image_object_key:selected.image_object_key?clean(selected.image_object_key,240):null,
   }):null,
   operations:Object.freeze([]),
   changesPaymentStatus:false,changesInventory:false,changesInvoice:false
  });
 }
 return Object.freeze({preflight,modes,channels});
});
