/* KINTO manual payment instruction assembly — isolated, pure, NO I/O.
 * This is a PREVIEW CONTRACT, not an authorization service. Trusted booleans
 * must only be supplied after a future server verifies sessions, card,
 * invoice and order state. Never call it directly with untrusted UI fields.
 * It cannot send, alter invoices, mark payment, or deduct stock.
 */
(function(root,factory){
 const api=factory(root);
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.KintoManualInstructionAssemblyV1=api;
})(typeof globalThis!=='undefined'?globalThis:null,function(root){
 'use strict';
 function deps(){
  const r=(typeof module==='object'&&module.exports&&typeof require==='function')
   ?{
      invoice:require('./kinto-invoice-readonly-v1.js'),
      policy:require('./kinto-manual-card-policy-v1.js'),
      preflight:require('./kinto-manual-dispatch-preflight-v1.js'),
      message:require('./kinto-manual-payment-message-v1.js'),
      snapshot:require('./kinto-payment-instruction-snapshot-v1.js')
     }
   :{
      invoice:root?.KintoInvoiceReadOnlyV1,
      policy:root?.KintoManualCardPolicyV1,
      preflight:root?.KintoManualDispatchPreflightV1,
      message:root?.KintoManualPaymentMessageV1,
      snapshot:root?.KintoPaymentInstructionSnapshotV1
     };
  if(Object.values(r).some(x=>!x))throw Error('INSTRUCTION_DEPENDENCIES_MISSING');
  return r;
 }
 function assemble(source){
  if(!source||source.serverAuthorized!==true||source.employeeAuthorized!==true
    ||source.orderEligible!==true||source.invoiceAuthorized!==true)
   throw Error('SERVER_AUTHORIZATION_REQUIRED');
  const d=deps();
  // This adapter reads exact approved invoice values. It never calculates totals.
  const approvedInvoice=d.invoice.extract({
   trustedInvoiceSource:source.serverAuthorized,
   accessApproved:source.invoiceAuthorized,invoice:source.approvedInvoice
  });
  if(String(source.orderCode||'')!==approvedInvoice.orderCode)throw Error('INVOICE_ORDER_MISMATCH');
  if(String(source.invoiceVersion||'')!==approvedInvoice.version)throw Error('STALE_INVOICE');
  const card=d.policy.choose(source.serverCards,source.mode,source.selectedCardId);
  const preflight=d.preflight.preflight({
    employeeAuthorized:source.employeeAuthorized,invoiceAuthorized:source.invoiceAuthorized,
    orderEligible:source.orderEligible,mode:source.mode,channel:source.channel,
    invoice:approvedInvoice,invoiceVersion:source.invoiceVersion,
    serverCards:source.serverCards,cardId:card?.id||''
  });
  if(card&&preflight.card?.id!==card.id)throw Error('CARD_CHANGED_DURING_PREVIEW');
  const msg=d.message.compose({mode:source.mode,approvedInvoice,card:preflight.card});
  if(msg.amountMinor!==preflight.amountMinor||msg.currency!==preflight.currency)
   throw Error('AMOUNT_MISMATCH');
  const shot=d.snapshot.make({
   employeeAuthorized:source.employeeAuthorized,invoiceAuthorized:source.invoiceAuthorized,
   orderEligible:source.orderEligible,requestId:source.requestId,actorId:source.actorId,
   orderCode:approvedInvoice.orderCode,invoiceVersion:approvedInvoice.version,
   mode:source.mode,channel:source.channel,amountMinor:preflight.amountMinor,
   currency:approvedInvoice.currency,card:preflight.card
  });
  return Object.freeze({
    title:msg.title,mode:source.mode,channel:source.channel,
    orderCode:approvedInvoice.orderCode,currency:approvedInvoice.currency,
    transferAmountMinor:preflight.amountMinor,
    shippingAtDoorMinor:preflight.deliveryDueMinor,
    selectedCard:preflight.card,messageText:msg.text,instructionSnapshot:shot,
    sendsMessage:false,marksOrderPaid:false,updatesStock:false,
    changesInvoice:false,changesCustomerPage:false
  });
 }
 return Object.freeze({assemble});
});
