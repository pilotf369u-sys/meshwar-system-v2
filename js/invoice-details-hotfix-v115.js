/* V115 — deterministic invoice enhancement for every order-details modal. */
(()=>{'use strict';
const enhance=(box,order)=>{if(box&&order&&window.KintoBundleV93)window.KintoBundleV93.enhance(box,order)};
const wrap=(name,resolve)=>{
  const base=window[name];
  if(typeof base!=='function'||base.__kintoInvoiceDirect)return;
  const direct=async function(...args){
    const result=await base.apply(this,args);
    const target=resolve(...args);
    enhance(target?.box,target?.order);
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
})();
