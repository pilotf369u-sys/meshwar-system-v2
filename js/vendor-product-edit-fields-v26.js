/* MESHWAR_VENDOR_PRODUCT_EDIT_FIELDS_V26 */
(function(){
  'use strict';
  const VERSION='20260824-1658';
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

  function store(win){try{return JSON.parse(win.sessionStorage.getItem('meshwar_vendor_store')||'null')}catch{return null}}
  const val=(win,id)=>String(win.document.getElementById(id)?.value||'').trim();

  function refreshInjectedFields(win){
    try{win.MeshwarDetailedDescriptionV8?.ensureField?.()}catch(e){console.warn('V26 detailed description field refresh failed',e)}
    try{win.MeshwarStoreCategoriesV9?.refreshProductCategoryFields?.()}catch(e){console.warn('V26 taxonomy field refresh failed',e)}
  }

  function hydrateEdit(win,id){
    refreshInjectedFields(win);
    win.__mwV26TaxonomyTouched=false;
    const run=()=>{
      if(win.__mwV26TaxonomyTouched)return;
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

  function bindTaxonomyTouch(win){
    if(win.__mwV26TaxonomyTouchBound)return;
    win.document.addEventListener('change',e=>{
      if(e.target?.id==='mwProductMainCategory'||e.target?.id==='mwProductSubCategory')win.__mwV26TaxonomyTouched=true;
    },true);
    win.__mwV26TaxonomyTouchBound=true;
  }

  function taxonomySnapshot(win){
    const main=val(win,'mwProductMainCategory');
    const sub=val(win,'mwProductSubCategory');
    return {main,sub,effective:sub||main||null};
  }

  function wrapSaveProduct(win){
    const original=win.saveProduct;
    if(typeof original!=='function'||original.__mwEditFieldsV26Save)return false;
    const wrapped=async function(){
      const st=store(win);
      const id=val(win,'productId');
      const name=val(win,'productName');
      const taxonomy=taxonomySnapshot(win);
      const detailed=val(win,'productDetailedDescription');
      const persistTaxonomy=!id||win.__mwV26TaxonomyTouched||Boolean(taxonomy.main||taxonomy.sub);
      const result=await original.apply(this,arguments);
      if(st?.id&&name&&persistTaxonomy){
        try{
          await win.MeshwarTaxonomyPersistenceV10?.persistTaxonomy?.({
            id,
            name,
            storeId:String(st.id),
            taxonomy
          });
          win.__mwV26LastTaxonomyPersist={id,name,main:taxonomy.main,sub:taxonomy.sub,at:Date.now()};
        }catch(e){
          console.error('V26 taxonomy persistence failed',e);
          const message='تم حفظ بيانات المنتج الأساسية، لكن تعذر تثبيت التصنيف: '+(e?.message||e);
          if(typeof win.showNotice==='function')win.showNotice(message,true);
        }
      }
      if(st?.id&&name&&win.document.getElementById('productDetailedDescription')){
        try{
          const area=win.document.getElementById('productDetailedDescription');
          if(area)area.value=detailed;
          await win.MeshwarDetailedDescriptionV8?.persistDetailedDescription?.();
        }catch(e){console.error('V26 detailed description persistence failed',e)}
      }
      return result;
    };
    Object.assign(wrapped,{
      __mwEditFieldsV26Save:true,
      __mwBarcode:original.__mwBarcode,
      __mwV22:original.__mwV22,
      __mwTaxonomyV10:original.__mwTaxonomyV10,
      __mwFinanceV21:original.__mwFinanceV21
    });
    win.saveProduct=wrapped;
    return true;
  }

  async function boot(win){
    await loadDependencies(win);
    refreshInjectedFields(win);
    bindTaxonomyTouch(win);
    wrapEditProduct(win);
    wrapSaveProduct(win);
    let attempts=0;
    const timer=setInterval(()=>{
      attempts++;
      refreshInjectedFields(win);
      wrapEditProduct(win);
      wrapSaveProduct(win);
      bindTaxonomyTouch(win);
      if(attempts>=120)clearInterval(timer);
    },50);
    win.__mwVendorProductEditFieldsV26=true;
  }

  function install(win){
    if(!win||win.__mwVendorProductEditFieldsV26Installing||win.__mwVendorProductEditFieldsV26)return;
    win.__mwVendorProductEditFieldsV26Installing=true;
    boot(win).catch(e=>console.error('Vendor product edit V26 install failed',e)).finally(()=>{win.__mwVendorProductEditFieldsV26Installing=false});
  }

  window.MeshwarVendorProductEditFieldsV26={install,VERSION};
})();
