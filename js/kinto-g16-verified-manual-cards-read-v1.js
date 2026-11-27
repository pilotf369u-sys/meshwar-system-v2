/* KINTO G16 read-only staff bank catalogue client adapter.
 * No hardcoded domain, no browser key, no writes, no invoices or order access.
 * Calls ONLY the separately gated read-only Edge endpoint.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.KintoG16VerifiedManualCardsReadV1=api;
})(typeof globalThis!=='undefined'?globalThis:null,function(){
 'use strict';
 const endpoint='kinto-g16-employee-manual-cards-read-v1';
 function text(v,max=160){
  if(typeof v!=='string'||!v.trim()||v.length>max||/[\x00-\x1f\x7f]/.test(v))
   throw Error('INVALID_VERIFIED_CARD_FIELD');
  return v.trim();
 }
 function approved(row){
  if(!row||row.method_type!=='manual'||row.is_enabled!==true||
    !row.destination_verified_at||!Number.isFinite(Date.parse(row.destination_verified_at)))
    return false;
  try{
   text(row.id,128);text(row.recipient_name,100);text(row.account_reference,150);
   text(row.label,100);text(row.provider,80);
  }catch{return false}
  return true;
 }
 async function list(input){
  if(!input||typeof input.invoke!=='function')throw Error('EDGE_CLIENT_REQUIRED');
  const token=text(input.employeeSessionToken,512);
  if(token.length<20)throw Error('EMPLOYEE_SESSION_REQUIRED');
  const {data,error}=await input.invoke(endpoint,{
   body:{action:'list_verified_manual_cards',session_token:token}
  });
  if(error||data?.ok!==true||!Array.isArray(data.cards))
   throw Error('VERIFIED_CARDS_UNAVAILABLE');
  if(data.cards.length>100)throw Error('CARD_CATALOGUE_EXCEEDS_LIMIT');
  return Object.freeze(data.cards.filter(approved).map(row=>Object.freeze({
   id:row.id,label:row.label,provider:row.provider,
   recipient_name:row.recipient_name,account_reference:row.account_reference,
   method_type:'manual',is_enabled:true,
   destination_verified_at:row.destination_verified_at,
   instructions:typeof row.instructions==='string'?row.instructions:'',
   is_default:false,image_available:false
  })));
 }
 return Object.freeze({list,approved,endpoint});
});
