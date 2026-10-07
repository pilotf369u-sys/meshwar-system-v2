/* KINTO V70 — canonical homepage store entry routing to isolated store page. */
(()=>{'use strict';
const ROOT_ID='meshwarFeaturedCampaigns';
const storeHref=id=>`store.html?storeId=${encodeURIComponent(String(id||'').trim())}`;
let boundRoot=null;
function idFromHref(el){
  const raw=el.getAttribute?.('href');if(!raw)return'';
  try{return String(new URL(raw,location.href).searchParams.get('storeId')||'').trim()}catch{return''}
}
function idFromLegacyOpenStore(el){
  const raw=String(el.getAttribute?.('onclick')||'');
  const match=raw.match(/openStore\([^,]*,\s*['"]([^'"]+)['"]\s*\)/);
  return String(match?.[1]||'').trim();
}
function storeIdOf(el){return String(el.dataset?.openStore||el.dataset?.storeId||idFromHref(el)||idFromLegacyOpenStore(el)||'').trim()}
function makeNativeStoreLink(el,id){
  if(!id)return;
  const href=storeHref(id);
  if(el.tagName==='A'){
    el.href=href;el.dataset.storeId=id;el.removeAttribute('onclick');el.removeAttribute('aria-disabled');return;
  }
  const a=document.createElement('a');
  [...el.attributes].forEach(attr=>{if(!['type','onclick','href'].includes(attr.name))a.setAttribute(attr.name,attr.value)});
  a.href=href;a.dataset.storeId=id;a.innerHTML=el.innerHTML;
  el.replaceWith(a);
}
function normalizeStoreEntries(scope=document){
  const nodes=scope.querySelectorAll?.([
    'a[data-open-store]',
    'a[data-store-id]',
    'a[href*="storeId="]',
    'button.local-public-open',
    'button.local-store-open',
    '[onclick*="openStore("]'
  ].join(','))||[];
  nodes.forEach(el=>{
    const id=storeIdOf(el);
    if(!id){if(el.matches?.('a[data-open-store]')){el.removeAttribute('href');el.setAttribute('aria-disabled','true')}return;}
    makeNativeStoreLink(el,id);
  });
}
function slides(root){return [...root.querySelectorAll('.mw-featured-slide')]}
function dots(root){return [...root.querySelectorAll('.mw-featured-dot')]}
function activeIndex(root){const list=slides(root),i=list.findIndex(x=>x.classList.contains('is-active'));return i<0?0:i}
function setSlide(root,index){const list=slides(root);if(!list.length)return;const next=(Number(index)+list.length)%list.length;list.forEach((el,i)=>el.classList.toggle('is-active',i===next));dots(root).forEach((el,i)=>el.classList.toggle('is-active',i===next))}
function bindControls(root){
  if(boundRoot===root)return;
  boundRoot=root;
  root.addEventListener('click',e=>{
    if(e.target.closest('a[href*="store.html?storeId="]'))return;
    if(e.target.closest('#mwFeaturedPrev')){e.preventDefault();setSlide(root,activeIndex(root)-1);return;}
    if(e.target.closest('#mwFeaturedNext')){e.preventDefault();setSlide(root,activeIndex(root)+1);return;}
    const dot=e.target.closest('[data-dot]');if(dot){e.preventDefault();setSlide(root,Number(dot.dataset.dot)||0);}
  });
}
function harden(){
  normalizeStoreEntries(document);
  const root=document.getElementById(ROOT_ID);if(!root)return;
  root.onclick=null;
  bindControls(root);
}
function boot(){
  harden();
  const mo=new MutationObserver(()=>queueMicrotask(harden));
  mo.observe(document.documentElement,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
