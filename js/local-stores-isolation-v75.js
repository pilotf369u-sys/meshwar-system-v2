/* KINTO V75 — isolate homepage local-store directory behind native navigation. */
(()=>{'use strict';
const DEST='local-stores.html';
function replaceWithLink(el){
  if(!el)return null;
  if(el.tagName==='A'){
    el.href=DEST;
    el.removeAttribute('onclick');
    el.setAttribute('aria-label',el.getAttribute('aria-label')||'المتاجر المحلية');
    return el;
  }
  const a=document.createElement('a');
  [...el.attributes].forEach(attr=>{if(!['type','onclick','aria-pressed','aria-selected'].includes(attr.name))a.setAttribute(attr.name,attr.value)});
  a.href=DEST;
  a.innerHTML=el.innerHTML;
  a.setAttribute('aria-label',el.getAttribute('aria-label')||'المتاجر المحلية');
  el.replaceWith(a);
  return a;
}
function normalizeEntrypoints(){
  replaceWithLink(document.getElementById('showLocalStoresBtn'));
  document.querySelectorAll('#kintoStorePortalsV55 [data-kind="local"]').forEach(replaceWithLink);
  document.querySelectorAll('a[href="#localStoresPublic"],a[href$="#local-stores"]').forEach(replaceWithLink);
}
function cleanLegacyDirectory(){
  normalizeEntrypoints();
  const portal=document.querySelector('#kintoStorePortalsV55 [data-kind="local"]');
  if(portal)document.getElementById('localStoresPublic')?.remove();
}
function boot(){
  if(String(location.hash||'').toLowerCase()==='#local-stores'){location.replace(DEST);return;}
  cleanLegacyDirectory();
  const mo=new MutationObserver(()=>queueMicrotask(cleanLegacyDirectory));
  mo.observe(document.documentElement,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
