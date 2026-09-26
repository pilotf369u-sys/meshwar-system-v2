(function(){
  'use strict';
  const ID='kintoConnectivityNoticeV275';
  let hideTimer=0;
  function ensure(){
    let el=document.getElementById(ID);
    if(el)return el;
    el=document.createElement('div');
    el.id=ID;
    el.setAttribute('role','status');
    el.setAttribute('aria-live','polite');
    el.style.cssText='position:fixed;top:max(10px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:2147483000;max-width:calc(100% - 28px);padding:9px 14px;border-radius:999px;font:800 12px/1.4 system-ui,-apple-system,Segoe UI,Tahoma,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.24);text-align:center;direction:rtl;display:none';
    document.body.appendChild(el);
    return el;
  }
  function showOffline(){
    clearTimeout(hideTimer);
    const el=ensure();
    el.textContent='⚠️ لا يوجد اتصال بالإنترنت — بعض البيانات قد لا تكون محدثة';
    el.style.background='#241f12';el.style.color='#f5c451';el.style.border='1px solid rgba(245,196,81,.55)';el.style.display='block';
    document.documentElement.dataset.kintoOffline='1';
  }
  function showOnline(){
    delete document.documentElement.dataset.kintoOffline;
    const el=ensure();
    el.textContent='✓ عاد الاتصال بالإنترنت';
    el.style.background='#0a2f23';el.style.color='#fff';el.style.border='1px solid rgba(245,196,81,.45)';el.style.display='block';
    clearTimeout(hideTimer);hideTimer=setTimeout(()=>{el.style.display='none'},2200);
  }
  function init(){navigator.onLine?void 0:showOffline()}
  window.addEventListener('offline',showOffline);
  window.addEventListener('online',showOnline);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.KintoConnectivityV275=Object.freeze({isOffline:()=>!navigator.onLine});
})();