/* Customer-only: attach the existing receipt/review flow to every invoice entry. */
(()=>{
'use strict';
const bundle=window.KintoBundleV93;
if(!bundle?.printInvoice)return;
const print=bundle.printInvoice;
bundle.printInvoice=async function(order,...args){
  const page=await print.call(this,order,...args);
  if(page&&!page._invoiceErrorV58&&String(order?.status||'')==='تم التسليم'){
    await appendCustomerDeliveryPage(page,order);
  }
  return page;
};
})();
