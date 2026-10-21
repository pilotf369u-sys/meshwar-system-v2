/* Customer My Orders: reuse the shared invoice only after session-scoped KP proof. */
(()=>{
'use strict';
async function paidOrder(order){
  const load=window.KintoPaymentP5V1?.loadPayments;
  if(!load||!order?.id)return null;
  for(let page=1;;page++){
    const data=await load(page),payments=Array.isArray(data?.payments)?data.payments:[];
    const paid=payments.some(p=>p.status==='paid'&&p.payment_kind==='cart'
      &&Array.isArray(p.orders)&&p.orders.some(row=>String(row.order_id)===String(order.id)));
    if(paid){const d=typeof order.details==='string'?JSON.parse(order.details):order.details||{};
      return {...order,delivery_payment_type:'product_paid_delivery_cod',
        details:{...d,delivery_payment_type:'product_paid_delivery_cod'}}}
    if(page>=Math.max(1,Number(data?.pages)||1))return null;
  }
}
function removeOld(box){
  box.querySelectorAll('.kinto-v94-invoice-actions,.kinto-v93-invoice-btn,.kinto-v94-invoice-btn').forEach(b=>b.remove());
}
const base=window.openCustomerOrderDetails;
let request=0;
if(typeof base==='function')window.openCustomerOrderDetails=async function(index,...args){
  const mine=++request;
  const result=await base.call(this,index,...args);
  const order=typeof currentCustomerOrdersGlobal!=='undefined'?currentCustomerOrdersGlobal[index]:null;
  const box=document.getElementById('customerOrderDetailsContent');
  if(!order||!box||mine!==request)return result;
  delete box.dataset.customerPaidInvoice;
  try{
    const invoice=await paidOrder(order);
    if(!invoice||mine!==request||document.getElementById('customerOrderDetailsModal')?.style.display==='none')return result;
    box.dataset.customerPaidInvoice=String(order.id);
    removeOld(box);
    const button=document.createElement('button');
    button.type='button';button.dataset.customerElectronicInvoice='true';
    button.className='btn-details';
    button.textContent='عرض / طباعة الفاتورة الإلكترونية';
    button.style.cssText='display:block;width:100%;margin-top:12px;padding:12px';
    button.onclick=()=>{
      const popup=window.open('','_blank','width=1000,height=800');
      if(!popup)return alert('يرجى السماح بالنوافذ المنبثقة لعرض الفاتورة.');
      void window.KintoBundleV93.printInvoice(invoice,{canonicalOnly:true,invoiceWindow:popup});
    };
    box.appendChild(button);
  }catch(error){console.warn('Customer paid invoice proof unavailable',error)}
  return result;
};
const box=document.getElementById('customerOrderDetailsContent');
if(box)new MutationObserver(()=>{if(box.dataset.customerPaidInvoice)removeOld(box)}).observe(box,{childList:true,subtree:true});
})();
