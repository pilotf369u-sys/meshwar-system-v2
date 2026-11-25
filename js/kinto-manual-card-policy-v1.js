/* KINTO G16: isolated, read-only eligibility and card-choice policy.
 * No network, storage, order mutation, or payment confirmation.
 * Production integration requires a server-side authorization check.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.KintoManualCardPolicyV1=api;
})(typeof globalThis!=='undefined'?globalThis:null,function(){
 'use strict';
 const transferModes=Object.freeze(['card_full','goods_now_shipping_cod']);
 const allowedModes=Object.freeze([...transferModes,'full_cod']);
 function isVerified(m){
   return !!(m&&m.destination_verified_at&&Number.isFinite(Date.parse(m.destination_verified_at)));
 }
 function eligible(m){
   return !!m&&m.method_type==='manual'&&m.is_enabled===true&&isVerified(m)
     &&String(m.id||'').trim()!==''&&String(m.account_reference||'').trim()!==''
     &&String(m.recipient_name||'').trim()!=='';
 }
 function list(cards){
   return (Array.isArray(cards)?cards:[]).filter(eligible)
     .map(m=>({id:String(m.id),label:String(m.label||''),provider:String(m.provider||''),
       recipient_name:String(m.recipient_name||''),account_reference:String(m.account_reference),
       instructions:String(m.instructions||''),image_url:typeof m.image_url==='string'?m.image_url:null,
       image_object_key:typeof m.image_object_key==='string'?m.image_object_key:null,
       is_default:m.is_default===true}));
 }
 function choose(cards,mode,requestedId){
   if(!allowedModes.includes(mode))throw Error('INVALID_PAYMENT_CHOICE');
   if(mode==='full_cod')return null;
   const available=list(cards);
   if(!available.length)throw Error('NO_APPROVED_TRANSFER_CARD');
   if(requestedId!=null&&String(requestedId)!==''){
     const found=available.find(m=>m.id===String(requestedId));
     if(!found)throw Error('CARD_NOT_APPROVED');
     return found;
   }
   return available.find(m=>m.is_default)||available[0];
 }
 function preview(cards,mode,requestedId){
   const selected=choose(cards,mode,requestedId);
   return {mode,requires_card:transferModes.includes(mode),card:selected,
     requires_employee_payment_confirmation:mode!=='full_cod'};
 }
 return Object.freeze({eligible,list,choose,preview,allowedModes,transferModes});
});
