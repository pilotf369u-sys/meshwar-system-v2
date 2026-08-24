/* MESHWAR_VENDOR_PRODUCT_EDIT_FIELDS_V26 */
(function(){
  'use strict';
  const VERSION='20260824-v27-racefix2';
  const deps=[
    ['MeshwarDetailedDescriptionV8','js/local-store-detailed-description-v8.js?v=vendor-edit-v27-racefix2'],
    ['MeshwarStoreCategoriesV9','js/local-store-categories-v9.js?v=vendor-edit-v27-racefix2'],
    ['MeshwarTaxonomyPersistenceV10','js/local-store-taxonomy-persistence-v10.js?v=vendor-edit-v27-racefix2']
  ];
  function dependencyReady(win,name){
    if(name==='MeshwarDetailedDescriptionV8')return typeof win.MeshwarDetailedDescriptionV8?.persistDetailedDescriptionSnapshot==='function';
    if(name==='MeshwarTaxonomyPersistenceV10')return typeof win.MeshwarTaxonomyPersistenceV10?.taxonomySnapshot==='function';
    return Boolean(win[name]);
  }
  function appendScript(win,src,resolve,reject){
    const s=win.document.createElement('script');s.src=src;s.async=false;s.dataset.mwVendorEditV26='1';s.onload=()=>resolve();s.onerror=()=>reject(new Error('Failed to load '+src));(win.document.head||win.document.documentElement).appendChild(s);
  }
  function loadScript(win,globalName,src){
    if(dependencyReady(win,globalName))return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const d=win.document,existing=[...d.scripts].find(s=>String(s.src||'').includes(src.split('?')[0]));
      if(existing&&win[globalName]&&!dependencyReady(win,globalName)){appendScript(win,src,resolve,reject);return}
      if(existing){
        existing.addEventListener('load',()=>{if(dependencyReady(win,globalName))resolve();else appendScript(win,src,resolve,reject)},{once:true});
        existing.addEventListener('error',()=>reject(new Error('Failed to load '+src)),{once:true});
        let tries=0;const timer=setInterval(()=>{if(dependencyReady(win,globalName)){clearInterval(timer);resolve();return}if(++tries>=40){clearInterval(timer);appendScript(win,src,resolve,reject)}},50);return;
      }
      appendScript(win,src,resolve,reject);
    });
  }
  async function loadDependencies(win){for(const [name,src] of deps)await loadScript(win,name,src)}
  function fieldsReady(win){const d=win.document;return Boolean(d.getElementById('productDetailedDescription')&&d.getElementById('mwProductMainCategory')&&d.getElementById('mwProductSubCategory'))}
  function ensureFields(win){
    if(fieldsReady(win))return true;
    try{win.MeshwarDetailedDescriptionV8?.ensureField?.()}catch(e){console.warn('V26 detailed description field ensure failed',e)}
    try{win.MeshwarStoreCategoriesV9?.refreshProductCategoryFields?.()}catch(e){console.warn('V26 taxonomy field ensure failed',e)}
    return fieldsReady(win);
  }
  function installMissingFieldObserver(win){if(win.__mwV26MissingFieldObserver)return;const observer=new win.MutationObserver(()=>{if(!fieldsReady(win))ensureFields(win)});observer.observe(win.document.documentElement,{childList:true,subtree:true});win.__mwV26MissingFieldObserver=observer}
  async function boot(win){await loadDependencies(win);ensureFields(win);installMissingFieldObserver(win);win.__mwVendorProductEditFieldsV26=true}
  function install(win){if(!win||win.__mwVendorProductEditFieldsV26Installing||win.__mwVendorProductEditFieldsV26)return;win.__mwVendorProductEditFieldsV26Installing=true;boot(win).catch(e=>console.error('Vendor product edit V26 install failed',e)).finally(()=>{win.__mwVendorProductEditFieldsV26Installing=false})}
  window.MeshwarVendorProductEditFieldsV26={install,VERSION};
})();
