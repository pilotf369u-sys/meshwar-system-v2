/* Courier invoice presentation only; delivery actions and collections stay unchanged. */
(()=>{
'use strict';
let revision=0;
function projected(order){return {...order,delivery_payment_type:'product_paid_delivery_cod',
 details:{...parseDetails(order.details),delivery_payment_type:'product_paid_delivery_cod'},
 _kintoCustomerLoaded:true,_kintoCustomer:order._customer||null}}
async function proof(ids){
 const token=window.KintoCourierSessionV149?.read?.()?.token;
 if(!token)throw Error('COURIER_SESSION_REQUIRED');
 const sb=await getDeliverySb(),{data,error}=await sb.rpc('courier_paid_electronic_invoice_orders_v1',
  {p_session_token:String(token),p_order_ids:ids});
 if(error)throw error;
 return new Set((Array.isArray(data)?data:[]).map(row=>String(row.order_id)));
}
async function decorate(mine){
 const rows=[...deliveryOrders];if(!rows.length)return;
 try{
  const paid=await proof(rows.map(order=>order.id));
  if(mine!==revision)return;
  for(const order of rows){
   if(!paid.has(String(order.id)))continue;
   const card=[...document.querySelectorAll('#ordersGrid .shipment')].find(el=>el.dataset.id===String(order.id));
   const actions=card?.querySelector('.actions');
   if(!actions||actions.querySelector('[data-courier-electronic-invoice]'))continue;
   const button=document.createElement('button');
   button.type='button';button.className='btn btn-blue';button.dataset.courierElectronicInvoice=String(order.id);
   button.textContent='عرض / طباعة الفاتورة الإلكترونية';
   button.onclick=()=>{
    const popup=window.open('','_blank','width=1000,height=800');
    if(!popup)return alert('يرجى السماح بالنوافذ المنبثقة لعرض الفاتورة.');
    void(async()=>{
     try{
      if(!(await proof([order.id])).has(String(order.id)))throw Error('COURIER_INVOICE_UNAVAILABLE');
      await window.KintoBundleV93.printInvoice(projected(order),{canonicalOnly:true,invoiceWindow:popup});
     }catch(error){popup.close();console.warn('Courier electronic invoice unavailable',error);alert('تعذر عرض الفاتورة الإلكترونية. حدّث الشحنات وحاول مجدداً.')}
    })();
   };
   actions.appendChild(button);
  }
 }catch(error){console.warn('Courier paid invoice proof unavailable',error)}
}
const base=window.loadDeliveryOrders;
if(typeof base==='function')window.loadDeliveryOrders=async function(...args){
 const mine=++revision,result=await base.apply(this,args);
 void decorate(mine);
 return result;
};
})();
