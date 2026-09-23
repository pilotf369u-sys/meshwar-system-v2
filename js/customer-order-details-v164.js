/* V164 — isolated customer order-details presentation only. No order/invoice/auth writes. */
(()=>{'use strict';
function asciiDate(value){
  if(!value)return '---';
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return '---';
  const p=n=>String(n).padStart(2,'0');
  return p(d.getDate())+'/'+p(d.getMonth()+1)+'/'+d.getFullYear()+' '+p(d.getHours())+':'+p(d.getMinutes());
}
function decorate(index){
  const modal=document.getElementById('customerOrderDetailsModal');
  const box=document.getElementById('customerOrderDetailsContent');
  const card=modal?.querySelector('.modal-content');
  const order=Array.isArray(window.currentCustomerOrdersGlobal)?window.currentCustomerOrdersGlobal[index]:null;
  if(!modal||!box||!card||!order)return;
  if(!card.querySelector('.customer-order-brand-v164')){
    const brand=document.createElement('div');
    brand.className='customer-order-brand-v164';
    brand.style.cssText='display:flex;align-items:center;gap:9px;margin:0 0 12px;padding:9px 11px;border:1px solid rgba(215,166,46,.32);border-radius:13px;background:#0a2f23;color:#fff';
    brand.innerHTML='<img src="images/kinto-header-logo-v158.jpeg" alt="KINTO" style="width:38px;height:38px;object-fit:cover;border-radius:50%"><div><b style="display:block;letter-spacing:.7px">KINTO</b><small style="color:#ead28d">تفاصيل الطلب</small></div>';
    card.prepend(brand);
  }
  if(!box.querySelector('.customer-order-date-v164')){
    const row=document.createElement('p');
    row.className='customer-order-date-v164';
    row.innerHTML='<b>التاريخ:</b> <span dir="ltr"></span>';
    row.querySelector('span').textContent=asciiDate(order.created_at||order.updated_at);
    box.prepend(row);
  }
  requestAnimationFrame(()=>box.querySelectorAll('.kinto-v93-invoice-btn,.kinto-v94-invoice-btn').forEach(b=>b.remove()));
}
const base=window.openCustomerOrderDetails;
if(typeof base==='function'){
  window.openCustomerOrderDetails=function(index,...args){
    const result=base.call(this,index,...args);
    decorate(index);
    setTimeout(()=>decorate(index),0);
    return result;
  };
}
const modal=document.getElementById('customerOrderDetailsModal');
modal?.addEventListener('click',e=>{if(e.target===modal&&typeof window.closeCustomerOrderDetails==='function')window.closeCustomerOrderDetails()});
const observer=new MutationObserver(()=>{
  const m=document.getElementById('customerOrderDetailsModal');
  if(m?.style.display==='flex')m.querySelectorAll('.kinto-v93-invoice-btn,.kinto-v94-invoice-btn').forEach(b=>b.remove());
});
if(modal)observer.observe(modal,{childList:true,subtree:true});
})();