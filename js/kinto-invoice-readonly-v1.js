/* KINTO approved invoice display snapshot: PURE, READ ONLY, FAIL CLOSED.
 * This module MUST receive an invoice already authorized by an existing trusted
 * server path. Does NOT fetch, calculate prices, update an invoice or accept
 * customer-provided monetary values in a production integration.
 * All values are the exact existing invoice minor units, with NO conversion.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.KintoInvoiceReadOnlyV1=api;})(typeof globalThis!=='undefined'?globalThis:null,function(){
 'use strict';
 const allowed=Object.freeze(['IQD','USD']);
 function integer(value){
  return Number.isSafeInteger(value)&&value>=0;
 }
 function extract(authorized){
  if(!authorized||authorized.trustedInvoiceSource!==true||authorized.accessApproved!==true)
   throw Error('INVOICE_SOURCE_NOT_VERIFIED');
  const raw=authorized.invoice;
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('INVOICE_NOT_AVAILABLE');
  const orderCode=String(raw.orderCode||'');
  if(!/^(?:KN|MW)-[0-9]{4,12}$/.test(orderCode))throw Error('INVOICE_ORDER_CODE_INVALID');
  const currency=String(raw.currency||'').trim().toUpperCase();
  if(!allowed.includes(currency))throw Error('INVOICE_CURRENCY_UNSUPPORTED');
  const version=String(raw.version||'').trim();
  if(!version||version.length>120)throw Error('INVOICE_VERSION_REQUIRED');
  for(const k of ['prepaidMinor','goodsMinor','deliveryDueMinor']){
   if(!integer(raw[k]))throw Error('INVOICE_APPROVED_AMOUNTS_REQUIRED');
  }
  // Crucial: NEVER derive total/discount/shipping here, including by adding
  // goods and delivery. The approved order invoice is the single price source.
  return Object.freeze({
   orderCode,version,currency,prepaidMinor:raw.prepaidMinor,
   goodsMinor:raw.goodsMinor,deliveryDueMinor:raw.deliveryDueMinor
  });
 }
 return Object.freeze({extract});
});
