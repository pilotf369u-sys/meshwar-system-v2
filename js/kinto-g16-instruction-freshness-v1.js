/* KINTO V1 strict pre-send freshness gate — isolated, read only.
 * Re-checks the CURRENT server-authorized invoice and verified G16 card before
 * allowing a human to COPY instructions. It never dispatches an instruction.
 * The injected invoice provider must be implemented SERVER-side: a browser
 * boolean, order.total_price or a DOM invoice are NOT proof of approval.
 * Failure/changes always BLOCK, never replace the current confirmed amount.
 */
(function(root,factory){const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.KintoG16InstructionFreshnessV1=api;
})(typeof globalThis!=='undefined'?globalThis:null,function(){
 'use strict';
 const fields=Object.freeze(['id','label','recipient_name','account_reference','image_object_key']);
 const supported=Object.freeze(['card_full','goods_now_shipping_cod','full_cod']);
 function validAmount(n){return Number.isSafeInteger(n)&&n>=0}
 function snapshot(invoice,card,mode){
  if(!invoice||typeof invoice!=='object'||!supported.includes(mode))throw Error('INVOICE_SNAPSHOT_REQUIRED');
  if(!/^(?:KN|MW)-[0-9]{4,12}$/.test(String(invoice.orderCode||''))||
     typeof invoice.version!=='string'||!invoice.version.trim())
   throw Error('INVOICE_IDENTITY_MISSING');
  if(!['IQD','USD'].includes(invoice.currency)||!['prepaidMinor','goodsMinor','deliveryDueMinor'].every(k=>validAmount(invoice[k])))
   throw Error('INVOICE_AMOUNT_UNVERIFIED');
  if(mode!=='full_cod'&&(!card||!card.id||!card.account_reference||!card.recipient_name))
   throw Error('VERIFIED_CARD_REQUIRED');
  if(mode==='full_cod'&&card)throw Error('COD_CARD_FORBIDDEN');
  const amount=mode==='full_cod'?0:mode==='card_full'?invoice.prepaidMinor:invoice.goodsMinor;
  if(mode!=='full_cod'&&amount<=0)throw Error('ZERO_TRANSFER_AMOUNT');
  return Object.freeze({orderCode:invoice.orderCode,invoiceVersion:invoice.version,
   currency:invoice.currency,mode,amountMinor:amount,deliveryDueMinor:invoice.deliveryDueMinor,
   card:card?Object.freeze(Object.fromEntries(fields.map(k=>[k,card[k]??null]))):null});
 }
 function verify(previous,current){
  if(!previous||!current)throw Error('MISSING_SEND_FRESHNESS_PROOF');
  for(const key of ['orderCode','invoiceVersion','currency','mode','amountMinor','deliveryDueMinor']){
   if(previous[key]!==current[key])throw Error('STALE_APPROVED_INVOICE');
  }
  for(const field of fields){
   if((previous.card?.[field]??null)!==(current.card?.[field]??null))
    throw Error('STALE_APPROVED_CARD');
  }
  return Object.freeze({fresh:true,sendAuthorized:false,paid:false,ordersChanged:false});
 }
 async function recheck(input){
  if(!input||typeof input.fetchCurrentApprovedInvoice!=='function'||
   typeof input.fetchVerifiedCards!=='function')throw Error('TRUSTED_SERVER_READERS_REQUIRED');
  const old=input.originalSnapshot;
  if(!old||!supported.includes(old.mode))throw Error('INSTRUCTION_SNAPSHOT_REQUIRED');
  // Read both again, immediately before copy/handoff. No silent fallback.
  const invoice=await input.fetchCurrentApprovedInvoice(old.orderCode);
  if(!invoice||invoice.serverVerified!==true||invoice.orderEligible!==true)
   throw Error('CURRENT_APPROVED_INVOICE_REQUIRED');
  if(invoice.orderCode!==old.orderCode)throw Error('INVOICE_ORDER_MISMATCH');
  const cards=await input.fetchVerifiedCards();
  if(!Array.isArray(cards))throw Error('CURRENT_VERIFIED_CARDS_REQUIRED');
  const card=old.mode==='full_cod'?null:cards.find(c=>String(c.id)===String(old.card?.id));
  if(old.mode!=='full_cod'&&(!card||card.method_type!=='manual'||card.is_enabled!==true||
   !card.destination_verified_at))throw Error('CURRENT_VERIFIED_CARD_REQUIRED');
  const current=snapshot(invoice,card,old.mode);
  verify(old,current);
  return Object.freeze({fresh:true,requiresEmployeeConfirmation:true,
   messageMayBeCopied:true,automaticDispatch:false,
   paymentConfirmed:false,invoiceChanged:false,stockChanged:false});
 }
 return Object.freeze({snapshot,verify,recheck});
});
