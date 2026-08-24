/* MESHWAR_VENDOR_PRODUCT_EDIT_FIELDS_V26 */
(function(){
  'use strict';
  const VERSION='20260824-1630';
  const deps=[
    ['MeshwarDetailedDescriptionV8','js/local-store-detailed-description-v8.js?v=vendor-edit-v26'],
    ['MeshwarStoreCategoriesV9','js/local-store-categories-v9.js?v=vendor-edit-v26'],
    ['MeshwarTaxonomyPersistenceV10','js/local-store-taxonomy-persistence-v10.js?v=vendor-edit-v26']
  ];

  function loadScript(win,globalName,src){
    if(win[globalName])return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const d=win.document;
      const existing=[...d.scripts].find(s=>String(s.src||'').includes(src.split('?')[0]));
      if(existing){
        if(win[globalName])return resolve();
        existing.addEventListener('load',()=>resolve(),{once:true});
        existing.addEventListener('error',()=>reject(new Error('Failed to load '+src)),{once:true});
        setTimeout(()=>win[globalName]?resolve():null,50);
        return;
      }
      const s=d.createElement('script');s.src=src;s.async=false;s.dataset.mwVendorEditV26='1';
      s.onload=()=>resolve();s.onerror=()=>reject(new Error('Failed to load '+src));
      (d.head||d.documentElement).appendChild(s);
    });
  }

  async function loadDependencies(win){
    for(const [name,src] of deps)await loadScript(win,name,src);
  }

  function refreshInjectedFields(win){
    try{win.MeshwarDetailedDescriptionV8?.ensureField?.()}catch(e){console.warn('V26 detailed description field refresh failed',e)}
    try{win.MeshwarStoreCategoriesV9?.refreshProductCategoryFields?.()}catch(e){console.warn('V26 taxonomy field refresh failed',e)}
  }

  function hydrateEdit(win,id){
    refreshInjectedFields(win);
    const run=()=>{
      try{win.MeshwarDetailedDescriptionV8?.fillDetailedDescription?.()}catch(e){console.warn('V26 detailed description hydrate failed',e)}
      try{win.MeshwarTaxonomyPersistenceV10?.hydrateTaxonomyForEdit?.(id)}catch(e){console.warn('V26 taxonomy hydrate failed',e)}
    };
    run();
    [120,350,750].forEach(ms=>setTimeout(run,ms));
  }

  function wrapEditProduct(win){
    const original=win.editProduct;
    if(typeof original!=='function'||original.__mwEditFieldsV26)return false;
    const wrapped=function(id){
      const result=original.apply(this,arguments);
      hydrateEdit(win,id);
      return result;
    };
    Object.assign(wrapped,{
      __mwEditFieldsV26:true,
      __mwBarcode:original.__mwBarcode,
      __mwV22:original.__mwV22,
      __mwTaxonomyV10:original.__mwTaxonomyV10,
      __mwFinanceV21:original.__mwFinanceV21
    });
    win.editProduct=wrapped;
    return true;
  }

  async function boot(win){
    await loadDependencies(win);
    refreshInjectedFields(win);
    let attempts=0;
    const timer=setInterval(()=>{
      attempts++;
      refreshInjectedFields(win);
      wrapEditProduct(win);
      if(attempts>=80)clearInterval(timer);
    },50);
    wrapEditProduct(win);
    win.__mwVendorProductEditFieldsV26=true;
  }

  function install(win){
    if(!win||win.__mwVendorProductEditFieldsV26Installing||win.__mwVendorProductEditFieldsV26)return;
    win.__mwVendorProductEditFieldsV26Installing=true;
    boot(win).catch(e=>console.error('Vendor product edit V26 install failed',e)).finally(()=>{win.__mwVendorProductEditFieldsV26Installing=false});
  }

  window.MeshwarVendorProductEditFieldsV26={install,VERSION};
})();
