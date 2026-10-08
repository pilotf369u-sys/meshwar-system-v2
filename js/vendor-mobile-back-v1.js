/* MESHWAR_VENDOR_MOBILE_BACK_V1 */
(function(){
  'use strict';
  const VERSION='20261008-v2-safe-no-history-navigation';

  function install(win){
    if(!win||win.__mwVendorMobileBackV1)return;
    const d=win.document;
    let active=null,syncQueued=false;
    const nextTick=()=>{if(syncQueued)return;syncQueued=true;win.setTimeout(()=>{syncQueued=false;sync()},0)};
    const isOpen=el=>{
      if(!el||el.hidden||el.classList.contains('hidden'))return false;
      const style=win.getComputedStyle?.(el);
      return !style||(style.display!=='none'&&style.visibility!=='hidden');
    };
    const candidates=()=>[...d.querySelectorAll('#productModal,#vendorOrderDetailsModal,#vendorOrderScannerModal,[data-vendor-modal],div[id$="Modal"],div[id$="modal"]')]
      .filter(isOpen);
    const topModal=()=>candidates().sort((a,b)=>Number(win.getComputedStyle(a).zIndex||0)-Number(win.getComputedStyle(b).zIndex||0)).at(-1)||null;
    const close=el=>{
      if(el?.id==='productModal'&&typeof win.closeProductModal==='function')return win.closeProductModal();
      if(el?.id==='vendorOrderDetailsModal'&&typeof win.closeVendorOrderDetails==='function')return win.closeVendorOrderDetails();
      const button=el?.querySelector?.('[data-vendor-back-close],#vendorOrderScannerClose,button[onclick*="close"],button[onclick*="Close"]');
      if(button)return button.click();
      el?.classList?.add('hidden');el?.classList?.remove('flex');if(el?.style)el.style.display='none';
    };
    const sync=()=>{
      const modal=topModal();
      if(!modal){
        active=null;return;
      }
      if(active?.el===modal)return;
      active={el:modal,token:Date.now()+Math.random()};
    };
    new win.MutationObserver(nextTick).observe(d.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden']});
    d.addEventListener('click',()=>setTimeout(nextTick,0),true);
    const watcher=win.setInterval(nextTick,250);
    win.addEventListener('pagehide',()=>win.clearInterval(watcher),{once:true});
    win.__mwVendorMobileBackV1=true;
    nextTick();
  }
  window.MeshwarVendorMobileBackV1={install,VERSION};
})();
