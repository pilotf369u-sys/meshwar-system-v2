/* KINTO optional negotiation/request helper — isolated, pure, no mutations.
 * Requests for a discount or delivery estimate DO NOT change approved invoice,
 * payment instructions, payment state, shipping charges or any order.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.KintoPaymentQuestionsV1=api;})(typeof globalThis!=='undefined'?globalThis:null,function(){
 'use strict';
 const kinds=Object.freeze(['discount_request','delivery_estimate_question']);
 function make(input){
  const kind=String(input?.kind||'');
  if(!kinds.includes(kind))throw Error('INVALID_QUESTION_KIND');
  const orderCode=String(input?.orderCode||'').trim();
  if(!/^(?:KN|MW)-[0-9]{4,12}$/.test(orderCode))throw Error('INVALID_ORDER_CODE');
  const actor=String(input?.actor||'').trim();
  if(actor!=='customer'&&actor!=='employee')throw Error('INVALID_ACTOR');
  const comment=String(input?.comment||'').trim();
  if(comment.length>350||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(comment))throw Error('INVALID_QUESTION_TEXT');
  const subject=kind==='discount_request'?'طلب مراجعة خصم':'استفسار عن أجور التوصيل';
  const text='KINTO — '+subject+' للطلب '+orderCode+(comment?'\nملاحظة: '+comment:'');
  return Object.freeze({kind,orderCode,actor,text,requestedOnly:true,
   approvedDiscount:false,estimatedShippingIsFinal:false,
   changesInvoice:false,changesStatus:false,changesDeliveryFee:false,
   requiresExistingStaffReview:true});
 }
 function deliveryNotice(input){
  if(!input||!['IQD','USD'].includes(input.currency))throw Error('UNSUPPORTED_DELIVERY_CURRENCY');
  const status=String(input.status||'');
  if(status==='unavailable')return Object.freeze({status,text:'أجور التوصيل لم تُحدد بعد. سيبلغك الموظف بالمبلغ بعد التحقق.',confirmed:false});
  if(status!=='estimate'&&status!=='confirmed')throw Error('INVALID_DELIVERY_STATUS');
  const amount=input.amountMinor;
  if(!Number.isSafeInteger(amount)||amount<0)throw Error('INVALID_DELIVERY_AMOUNT');
  const rendered=new Intl.NumberFormat('en-US',{minimumFractionDigits:input.currency==='USD'?2:0,
   maximumFractionDigits:input.currency==='USD'?2:0}).format(amount/(input.currency==='USD'?100:1))+' '+input.currency;
  return Object.freeze({status,confirmed:status==='confirmed',
   amountMinor:amount,currency:input.currency,
   text:status==='estimate'?'أجور التوصيل التقديرية: '+rendered+'. المبلغ غير نهائي ويحتاج تأكيد الموظف.':
   'أجور التوصيل المعتمدة في الفاتورة: '+rendered+'.'});
 }
 return Object.freeze({make,deliveryNotice,kinds});
});
