/* KINTO V86 — direct order modal entry bridge with source-context return */
(()=>{'use strict';
  const params=new URLSearchParams(window.location.search);
  if(params.get('openOrder')!=='1')return;

  const fromGlobalStores=(()=>{
    try{
      if(!document.referrer)return false;
      const ref=new URL(document.referrer);
      return ref.origin===window.location.origin&&/\/global-stores\.html$/.test(ref.pathname);
    }catch{return false;}
  })();

  const openOrderModal=()=>{
    const modal=document.getElementById('orderModal');
    if(!modal)return;
    modal.style.display='block';

    if(fromGlobalStores){
      const closeBtn=[...modal.querySelectorAll('button')].find(btn=>String(btn.textContent||'').trim()==='إغلاق');
      if(closeBtn&&!closeBtn.dataset.kintoGlobalReturnV86){
        closeBtn.dataset.kintoGlobalReturnV86='1';
        closeBtn.addEventListener('click',()=>setTimeout(()=>window.location.assign('global-stores.html'),0),{once:true});
      }
    }

    const clean=new URL(window.location.href);
    clean.searchParams.delete('openOrder');
    history.replaceState(null,'',clean.pathname+(clean.search?clean.search:'')+(clean.hash||''));
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',openOrderModal,{once:true});
  else openOrderModal();
})();