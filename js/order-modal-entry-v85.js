/* KINTO V85 — direct order modal entry bridge from Global Stores only */
(()=>{'use strict';
  const params=new URLSearchParams(window.location.search);
  if(params.get('openOrder')!=='1')return;
  const openOrderModal=()=>{
    const modal=document.getElementById('orderModal');
    if(!modal)return;
    modal.style.display='block';
    const clean=new URL(window.location.href);
    clean.searchParams.delete('openOrder');
    history.replaceState(null,'',clean.pathname+(clean.search?clean.search:'')+(clean.hash||''));
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',openOrderModal,{once:true});
  else openOrderModal();
})();