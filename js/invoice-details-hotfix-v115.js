/* V115 — deterministic invoice enhancement for every order-details modal. */
(()=>{'use strict';
const isStaffDetails=name=>name==='openOrderDetailsById'||name==='openOrderDetailsModalData';
const enhance=(box,order,options)=>{if(box&&order&&window.KintoBundleV93)window.KintoBundleV93.enhance(box,order,options)};
const decorateStaffDetails=box=>{
  if(!box||box.querySelector('.kinto-staff-order-brand'))return;
  box.classList.add('kinto-staff-order-details');
  const source=document.getElementById('employeeBrandLogo')||document.getElementById('adminBrandLogo'),src=source?.src&& !source.src.startsWith('data:image/gif')?source.src:'';
  box.insertAdjacentHTML('afterbegin',`<div class="kinto-staff-order-brand">${src?`<img class="kinto-staff-order-logo" src="${src.replace(/"/g,'&quot;')}" alt="KINTO">`:'<span class="kinto-staff-order-mark">K</span>'}<div><b>KINTO</b><small>تفاصيل الطلب</small></div></div>`);
};
const wrap=(name,resolve)=>{
  const base=window[name];
  if(typeof base!=='function'||base.__kintoInvoiceDirect)return;
  const direct=async function(...args){
    const result=await base.apply(this,args);
    const target=resolve(...args);
    const staff=isStaffDetails(name);
    if(staff)decorateStaffDetails(target?.box);
    enhance(target?.box,target?.order,staff?{storeScoped:true,storeInvoiceButtons:false}:undefined);
    return result;
  };
  direct.__kintoInvoiceDirect=true;
  window[name]=direct;
};

wrap('openCustomerOrderDetails',index=>({
  box:document.getElementById('customerOrderDetailsContent'),
  order:typeof currentCustomerOrdersGlobal!=='undefined'&&Array.isArray(currentCustomerOrdersGlobal)?currentCustomerOrdersGlobal[index]:null
}));
wrap('openOrderDetailsById',encodedId=>{
  const id=String(decodeURIComponent(encodedId||''));
  const rows=typeof cloudOrders!=='undefined'&&Array.isArray(cloudOrders)?cloudOrders:[];
  return{box:document.getElementById('modalOrderDetailsBody'),order:rows.find(o=>String(o?.id)===id)};
});
wrap('openOrderDetailsModalData',encodedId=>{
  const id=String(decodeURIComponent(encodedId||''));
  const rows=typeof adminOrdersCloud!=='undefined'&&Array.isArray(adminOrdersCloud)?adminOrdersCloud:[];
  return{box:document.getElementById('modalOrderDetailsBody'),order:rows.find(o=>String(o?.id)===id)};
});


// V155: presentation-only staff order details theme. No order/status/price mutation.
if(/(?:^|\/)(?:employee|admin)-dashboard\.html$/.test(location.pathname)){
  const staffStyle=document.createElement('style');
  staffStyle.textContent=`
  #orderDetailsModal{backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);background:rgba(4,25,19,.72)!important}
  #orderDetailsModal .modal-content{width:min(94vw,900px)!important;max-height:92vh!important;border:1px solid rgba(215,166,46,.34)!important;border-radius:22px!important;background:linear-gradient(145deg,rgba(255,255,255,.97),rgba(244,248,246,.94))!important;box-shadow:0 28px 80px rgba(2,20,15,.34),inset 0 1px 0 rgba(255,255,255,.88)!important;padding:22px!important}
  #orderDetailsModal .modal-content>h3{margin:0 0 14px;color:#0a2f23;font-size:20px}
  #orderDetailsModal .close{width:38px;height:38px;display:grid;place-items:center;border-radius:50%;background:rgba(10,47,35,.08);color:#0a2f23;line-height:1}
  .kinto-staff-order-brand{direction:ltr;display:flex;align-items:center;justify-content:flex-start;gap:10px;margin:0 0 18px;padding:12px 14px;border:1px solid rgba(215,166,46,.28);border-radius:16px;background:linear-gradient(135deg,rgba(10,47,35,.97),rgba(15,78,58,.94));color:#fff;box-shadow:0 12px 28px rgba(10,47,35,.16)}
  .kinto-staff-order-mark,.kinto-staff-order-logo{width:42px;height:42px;border-radius:50%;border:1px solid rgba(215,166,46,.72)}.kinto-staff-order-mark{display:grid;place-items:center;background:rgba(255,255,255,.08);color:#e5bd55;font-size:24px;font-weight:950}.kinto-staff-order-logo{display:block;object-fit:contain;background:rgba(255,255,255,.96);padding:3px}
  .kinto-staff-order-brand div{display:flex;flex-direction:column;line-height:1.1}.kinto-staff-order-brand b{font-size:20px;letter-spacing:1px}.kinto-staff-order-brand small{margin-top:5px;color:#ead28d;font-size:11px}
  .kinto-staff-order-details .detail-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important}
  .kinto-staff-order-details .detail-box{min-width:0;padding:12px 13px!important;border:1px solid rgba(10,47,35,.10)!important;border-radius:13px!important;background:rgba(255,255,255,.92)!important;box-shadow:0 5px 16px rgba(15,23,42,.045)!important;color:#17352b!important;-webkit-text-fill-color:#17352b!important}.kinto-staff-order-details .detail-box *:not(a):not(button):not(.qty-badge){color:#17352b!important;-webkit-text-fill-color:#17352b!important}
  .kinto-staff-order-details .detail-box b{color:#0a2f23}
  .kinto-staff-order-details .detail-image{max-width:180px!important;max-height:180px!important;padding:8px;border:1px solid rgba(215,166,46,.25);border-radius:16px;background:#fff;box-shadow:0 8px 24px rgba(15,23,42,.08)}
  .kinto-staff-order-details .kinto-v94-bundle{margin-top:18px!important;padding-top:16px!important;border-top:1px solid rgba(10,47,35,.12)!important}
  .kinto-staff-order-details .kinto-v94-global,.kinto-staff-order-details .kinto-v94-store-head{border-color:rgba(215,166,46,.28)!important;background:rgba(229,189,85,.08)!important;border-radius:13px!important}
  .kinto-staff-order-details .kinto-v94-bundle,.kinto-staff-order-details .kinto-v94-bundle *{color:#17352b!important}.kinto-staff-order-details .kinto-v94-global strong,.kinto-staff-order-details .kinto-v94-store-head strong,.kinto-staff-order-details .kinto-v94-price,.kinto-staff-order-details .kinto-v94-price *{color:#0a2f23!important}.kinto-staff-order-details .kinto-v94-meta{color:#5b6f67!important}.kinto-staff-order-details .kinto-v94-item{background:rgba(255,255,255,.92)!important;border:1px solid rgba(10,47,35,.10)!important;border-radius:13px!important}
  .kinto-staff-order-details .kinto-v94-invoice-actions{padding-top:2px}
  .kinto-staff-order-details .kinto-v94-invoice-btn{border-radius:12px!important;padding:11px 16px!important;box-shadow:0 8px 18px rgba(10,47,35,.14)}
  @media(max-width:700px){#orderDetailsModal .modal-content{width:96vw!important;margin:2vh auto!important;padding:14px!important;border-radius:17px!important}.kinto-staff-order-details .detail-grid{grid-template-columns:1fr!important}.kinto-staff-order-brand{padding:10px 12px}.kinto-staff-order-mark{width:38px;height:38px}.kinto-staff-order-brand b{font-size:18px}}
  `;
  document.head.appendChild(staffStyle);
}

// V138: load the isolated review-moderation bundle only inside the admin dashboard.
if(/(?:^|\/)admin-dashboard\.html$/.test(location.pathname)){
  const style=document.createElement('link');
  style.rel='stylesheet';style.href='css/admin-product-reviews-v138.css?v=20260912-v153-actions';
  document.head.appendChild(style);
  const script=document.createElement('script');
  script.src='js/admin-product-reviews-v138.js?v=20260912-v153-rejection';script.defer=true;
  document.head.appendChild(script);
}
})();
