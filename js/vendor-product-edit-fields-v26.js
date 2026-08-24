/* MESHWAR_VENDOR_PRODUCT_EDIT_FIELDS_V26 */
(function(){
  'use strict';
  const VERSION='20260824-1648';
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

  async function persistAfterSuccessfulSave(win,s){
    for(let i=0;i<18;i++){
      await new Promise(r=>setTimeout(r,i?120:180));
      const modal=win.document.getElementById('productModal');
      if(modal&&!modal.classList.contains('hidden'))continue;
      try{
        if(s.persistTaxonomy){
          await win.MeshwarTaxonomyPersistenceV10?.persistTaxonomy?.({
            id:s.id,
            name:s.name,
            storeId:s.storeId,
            taxonomy:{main:s.main,sub:s.sub,effective:s.sub||s.main||null}
          });
        }
        await win.MeshwarDetailedDescriptionV8?.persistDetailedDescription?.();
        win.__mwV26LastPersist={id:s.id,name:s.name,main:s.main,sub:s.sub,at:Date.now()};
        return;
      }catch(e){
        if(i===17)console.error('V26 product edit persistence recovery failed',e);
      }
    }
  }

  function bindSaveRecovery(win){
    if(win.__mwV26SaveRecoveryBound)return;
    win.document.addEventListener('click',e=>{
      const btn=e.target?.closest?.('button[onclick*="saveProduct"],button');
      if(!btn)return;
      const onclick=String(btn.getAttribute('onclick')||''),text=String(btn.textContent||'');
      if(!onclick.includes('saveProduct')&&!text.includes('حفظ المنتج'))return;
      const st=store(win),id=val(win,'productId'),name=val(win,'productName'),main=val(win,'mwProductMainCategory'),sub=val(win,'mwProductSubCategory');
      if(!st?.id||!name)return;
      const persistTaxonomy=!id||win.__mwV26TaxonomyTouched||Boolean(main||sub);
      persistAfterSuccessfulSave(win,{id,name,storeId:String(st.id),main,sub,persistTaxonomy}).catch(err=>console.warn('V26 save recovery skipped',err));
    },true);
    win.__mwV26SaveRecoveryBound=true;
  }

  async function boot(win){
    await loadDependencies(win);
    refreshInjectedFields(win);
    bindTaxonomyTouch(win);
    bindSaveRecovery(win);
    let attempts=0;
    const timer=setInterval(()=>{
      attempts++;
      refreshInjectedFields(win);
      wrapEditProduct(win);
      bindTaxonomyTouch(win);
      bindSaveRecovery(win);
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
