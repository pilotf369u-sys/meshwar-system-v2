(function(){
  'use strict';

  let header=null;
  let observer=null;

  function mount(){
    const params=new URLSearchParams(location.search);
    if(String(params.get('screen')||'').toLowerCase()!=='customer')return;
    document.body?.classList.add('kinto-customer-shell');
    header=header||document.querySelector('.kinto-shell-header');
    if(header&&!header.isConnected)document.body?.prepend(header);
    if(!observer&&document.body){
      observer=new MutationObserver(()=>{if(header&&!header.isConnected)document.body.prepend(header)});
      observer.observe(document.body,{childList:true});
    }
  }

  function wrapHistory(method){
    const original=history[method];
    if(original.__kintoHeaderWrapped)return;
    const wrapped=function(){const result=original.apply(this,arguments);queueMicrotask(mount);return result};
    wrapped.__kintoHeaderWrapped=true;
    history[method]=wrapped;
  }

  window.KintoCustomerShellHeader={mount};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
  window.addEventListener('pageshow',mount);
  window.addEventListener('popstate',mount);
  window.addEventListener('hashchange',mount);
  wrapHistory('pushState');
  wrapHistory('replaceState');
})();
