/* KINTO isolated WhatsApp handoff: builds a message link, NEVER sends.
 * Employee must choose contact explicitly, review text and manually press Send in WhatsApp.
 * Image cannot be silently attached by a wa.me link.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.KintoPaymentWhatsappHandoffV1=api;})(typeof globalThis!=='undefined'?globalThis:null,function(){
 'use strict';
 function normalizePhone(input){
  if(typeof input!=='string'||input.length>22)throw Error('INVALID_CUSTOMER_PHONE');
  const compact=input.trim().replace(/[ ()-]/g,'');
  if(!/^\+?[1-9][0-9]{7,14}$/.test(compact))throw Error('INVALID_CUSTOMER_PHONE');
  return compact.replace(/^\+/,'');
 }
 function build(phone,text){
  const number=normalizePhone(phone);
  if(typeof text!=='string'||text.trim().length<10||text.length>3900)throw Error('INVALID_PAYMENT_MESSAGE');
  if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))throw Error('INVALID_PAYMENT_MESSAGE');
  // Do not accept a pre-built URL or user-controlled HTML. Encode message as text.
  const link='https://wa.me/'+number+'?text='+encodeURIComponent(text);
  if(link.length>13000)throw Error('WHATSAPP_LINK_TOO_LONG');
  return Object.freeze({url:link,recipient:number,message:text,requiresEmployeeSend:true,
    imageAutoAttached:false,ordersModified:false,paymentConfirmed:false});
 }
 return Object.freeze({build,normalizePhone});
});
