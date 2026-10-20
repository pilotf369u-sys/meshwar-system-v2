/* Courier collection display only. No invoices or stored order/payment writes. */
(()=>{
'use strict';
async function prepare(rows){
 if(!rows.length)return rows;
 try{
  const token=window.KintoCourierSessionV149?.read?.()?.token;
  if(!token)throw Error('COURIER_SESSION_REQUIRED');
  const sb=await getDeliverySb(),paid=new Set();
  for(let offset=0;offset<rows.length;offset+=100){
   const ids=rows.slice(offset,offset+100).map(order=>order.id);
   const {data,error}=await sb.rpc('courier_paid_electronic_invoice_orders_v1',
    {p_session_token:String(token),p_order_ids:ids});
   if(error)throw error;
   if(!Array.isArray(data))throw Error('COURIER_PAYMENT_PROOF_INVALID');
   for(const row of data)paid.add(String(row.order_id));
  }
  return rows.map(order=>paid.has(String(order.id))&&order.delivery_payment_type!=='paid_prepaid'
   ?{...order,delivery_payment_type:'product_paid_delivery_cod'}:order);
 }catch(error){
  console.warn('Courier collection verification unavailable',error);
  // Never tell a courier to collect goods again while payment proof is unavailable.
  return rows.map(order=>order.delivery_payment_type==='paid_prepaid'||order.delivery_payment_type==='product_paid_delivery_cod'
   ?order:{...order,_courierCollectionUnknownV1:true});
 }
}
window.KintoCourierCollectionV1=Object.freeze({prepare});
})();
