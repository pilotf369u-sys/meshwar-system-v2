/* KINTO V73 — remove legacy global-store directory/categories from homepage only. */
(()=>{'use strict';
const GLOBAL_SECTION_ID='internationalStoresSection';
const GLOBAL_CATEGORY_LABELS=new Set(['الكل','المتاجر الشاملة','الأزياء والملابس','الرياضة والأحذية','التجميل والعناية','المنزل والأطفال والسوبر ماركت']);
function cleanLegacyGlobalDirectory(){
  document.getElementById(GLOBAL_SECTION_ID)?.remove();
  document.querySelectorAll('.nav-container').forEach(nav=>{
    const labels=[...nav.querySelectorAll('a,button')].map(el=>String(el.textContent||'').trim()).filter(Boolean);
    if(labels.some(label=>GLOBAL_CATEGORY_LABELS.has(label)))nav.remove();
  });
}
function boot(){
  cleanLegacyGlobalDirectory();
  const mo=new MutationObserver(()=>queueMicrotask(cleanLegacyGlobalDirectory));
  mo.observe(document.documentElement,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
