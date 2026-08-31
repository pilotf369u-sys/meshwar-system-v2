/* KINTO V71 — native navigation for global-store entry points only. */
(()=>{'use strict';
const DEST='global-stores.html';
function replaceWithLink(el){
  if(!el||el.tagName==='A')return;
  const a=document.createElement('a');
  [...el.attributes].forEach(attr=>{if(!['type','onclick','aria-pressed'].includes(attr.name))a.setAttribute(attr.name,attr.value)});
  a.href=DEST;
  a.innerHTML=el.innerHTML;
  a.setAttribute('aria-label',el.getAttribute('aria-label')||'المتاجر العالمية');
  el.replaceWith(a);
}
function normalize(){
  replaceWithLink(document.getElementById('showInternationalStoresBtn'));
  document.querySelectorAll('#kintoStorePortalsV55 [data-kind="global"]').forEach(replaceWithLink);
}
function boot(){
  if(String(location.hash||'').toLowerCase()==='#global-stores'){location.replace(DEST);return;}
  normalize();
  const root=document.getElementById('meshwarStoreTabs')?.parentElement||document.body;
  const mo=new MutationObserver(()=>queueMicrotask(normalize));
  mo.observe(root,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
