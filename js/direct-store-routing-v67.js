/* KINTO V67 — direct featured-store routing; no delegated store click handler. */
(()=>{'use strict';
const ROOT_ID='meshwarFeaturedCampaigns';
const storeHref=id=>`index.html?storeId=${encodeURIComponent(String(id||'').trim())}`;
let boundRoot=null;
function normalizeStoreLinks(root){
  root.querySelectorAll('a[data-open-store]').forEach(a=>{
    const id=String(a.dataset.openStore||'').trim();
    if(!id){a.removeAttribute('href');a.setAttribute('aria-disabled','true');return;}
    a.href=storeHref(id);
    a.dataset.storeId=id;
    a.removeAttribute('onclick');
    a.removeAttribute('aria-disabled');
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
    if(e.target.closest('a[data-open-store]'))return; // native href navigation only
    if(e.target.closest('#mwFeaturedPrev')){e.preventDefault();setSlide(root,activeIndex(root)-1);return;}
    if(e.target.closest('#mwFeaturedNext')){e.preventDefault();setSlide(root,activeIndex(root)+1);return;}
    const dot=e.target.closest('[data-dot]');if(dot){e.preventDefault();setSlide(root,Number(dot.dataset.dot)||0);}
  });
}
function harden(){
  const root=document.getElementById(ROOT_ID);if(!root)return;
  /* Remove V13 delegated onclick that called preventDefault()+openStore().
     Store anchors now navigate directly using their real storeId in href. */
  root.onclick=null;
  normalizeStoreLinks(root);
  bindControls(root);
}
function boot(){
  harden();
  const mo=new MutationObserver(()=>queueMicrotask(harden));
  mo.observe(document.documentElement,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
