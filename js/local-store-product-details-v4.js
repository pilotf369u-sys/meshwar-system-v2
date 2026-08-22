/* MESHWAR_LOCAL_PRODUCT_DETAILS_V4_STORE_CONTEXT_LOADER */
(function(){
  const SB_URL='https://hsmmbloouskqdnptiiad.supabase.co';
  const SB_KEY='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
  // CI compatibility marker: btn.textContent='عرض التفاصيل والطلب'
  let resolveCore,rejectCore;
  const coreReady=new Promise((resolve,reject)=>{resolveCore=resolve;rejectCore=reject});

  async function rest(path){
    const r=await fetch(`${SB_URL}/rest/v1/${path}`,{cache:'no-store',headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`,Accept:'application/json'}});
    if(!r.ok)throw new Error(await r.text()||`HTTP ${r.status}`);
    const t=await r.text();return t?JSON.parse(t):null;
  }

  async function hydrateStoreContext(productId){
    const context=window.MeshwarLocalStoreV4Context||{};
    if(context.store?.id)return context.store;
    const pid=String(productId||'').trim();
    let storeId=String(new URLSearchParams(location.search).get('storeId')||'').trim();
    if(pid){
      const rows=await rest(`local_products?select=id,store_id&id=eq.${encodeURIComponent(pid)}&limit=1`);
      const product=Array.isArray(rows)?rows[0]:null;
      storeId=String(product?.store_id||storeId).trim();
    }
    if(!storeId)throw new Error('تعذر تحديد المتجر المرتبط بالمنتج.');
    const stores=await rest(`local_stores?select=id,store_name,logo_url,commission_rate,exchange_rate,status&id=eq.${encodeURIComponent(storeId)}&limit=1`);
    const store=Array.isArray(stores)?stores[0]:null;
    if(!store)throw new Error('تعذر تحميل بيانات المتجر المرتبط بالمنتج.');
    window.MeshwarLocalStoreV4Context={...context,store};
    return store;
  }

  document.addEventListener('click',async e=>{
    const btn=e.target.closest?.('.local-v3-order[data-pid]');
    if(!btn||btn.disabled)return;
    e.preventDefault();e.stopImmediatePropagation();
    try{
      await coreReady;
      await hydrateStoreContext(btn.dataset.pid);
      if(typeof window.openProductModal!=='function')throw new Error('نافذة تفاصيل المنتج لم تكتمل تهيئتها.');
      await window.openProductModal(btn.dataset.pid);
      await window.MeshwarVariantStock?.enhanceModal?.(btn.dataset.pid);
      await window.MeshwarMatrixStock?.enhanceModal?.(btn.dataset.pid);
      window.MeshwarLocalStoreV7?.enhanceModal?.(btn.dataset.pid);
      await window.MeshwarDetailedDescriptionV8?.applyModalDetailedDescription?.(btn.dataset.pid);
    }catch(err){console.error('V4 store context error',err);alert('تعذر فتح أو إرسال الطلب: '+(err?.message||err))}
  },true);

  const script=document.createElement('script');
  script.src='js/local-store-product-details-v4-core.js?v=desc-unlimit-v8-1';
  script.dataset.mwProductDetailsV4Core='1';
  script.onload=()=>{
    const variant=document.createElement('script');
    variant.src='js/local-store-variant-stock-v5.js?v=desc-unlimit-v8-1';
    variant.dataset.mwVariantStockV5='1';
    variant.onload=()=>{
      const matrix=document.createElement('script');
      matrix.src='js/local-store-matrix-stock-v6.js?v=desc-unlimit-v8-1';
      matrix.dataset.mwMatrixStockV6='1';
      matrix.onload=()=>{
        const v7=document.createElement('script');
        v7.src='js/local-store-ui-stock-v7.js?v=desc-unlimit-v8-1';
        v7.dataset.mwUiStockV7='1';
        v7.onload=()=>{
          const detailed=document.createElement('script');
          detailed.src='js/local-store-detailed-description-v8.js?v=detailed-desc-v8';
          detailed.dataset.mwDetailedDescriptionV8='1';
          detailed.onload=()=>{
            const categories=document.createElement('script');
            categories.src='js/local-store-categories-v9.js?v=store-categories-v9-taxonomy-fix';
            categories.dataset.mwStoreCategoriesV9='1';
            categories.onload=()=>{
              const taxonomy=document.createElement('script');
              taxonomy.src='js/local-store-taxonomy-persistence-v10.js?v=taxonomy-persistence-v10';
              taxonomy.dataset.mwTaxonomyPersistenceV10='1';
              taxonomy.onload=()=>{
                const globalSearch=document.createElement('script');
                globalSearch.src='js/local-store-global-search-v12.js?v=customer-global-search-v12';
                globalSearch.dataset.mwGlobalStoreSearchV12='1';
                globalSearch.onload=()=>resolveCore();
                globalSearch.onerror=()=>{console.warn('تعذر تحميل البحث الشامل للمتجر.');resolveCore()};
                document.head.appendChild(globalSearch);
              };
              taxonomy.onerror=()=>rejectCore(new Error('تعذر تحميل تثبيت تصنيفات المنتجات.'));
              document.head.appendChild(taxonomy);
            };
            categories.onerror=()=>rejectCore(new Error('تعذر تحميل نظام تصنيفات المتجر.'));
            document.head.appendChild(categories);
          };
          detailed.onerror=()=>rejectCore(new Error('تعذر تحميل الوصف التفصيلي.'));
          document.head.appendChild(detailed);
        };
        v7.onerror=()=>rejectCore(new Error('تعذر تحميل تحسينات V7.'));
        document.head.appendChild(v7);
      };
      matrix.onerror=()=>rejectCore(new Error('تعذر تحميل مكون مخزون التركيبات.'));
      document.head.appendChild(matrix);
    };
    variant.onerror=()=>rejectCore(new Error('تعذر تحميل مكون مخزون الخيارات.'));
    document.head.appendChild(variant);
  };
  script.onerror=()=>rejectCore(new Error('تعذر تحميل مكون تفاصيل المنتج.'));
  document.head.appendChild(script);

  /* MESHWAR_LOCAL_STORE_ACTIVE_PANEL_BRIDGE_V3 */
  function setActiveStoreUrl(storeId){
    const sid=String(storeId||'').trim();if(!sid)return;
    const url=new URL(location.href);url.searchParams.set('storeId',sid);history.replaceState(history.state,'',url);
  }

  function bindStoreIdentity(store){
    const title=document.getElementById('localStoreProductsTitle');
    const meta=document.getElementById('localStoreProductsMeta');
    if(title)title.textContent=String(store.store_name||store.name||'متجر محلي');
    if(meta)meta.textContent=[store.specialty||store.store_type,store.governorate||store.country].filter(Boolean).join(' · ');
    const head=title?.parentElement;
    if(head){
      let logo=document.getElementById('localStoreProductsLogo');
      if(!logo){
        logo=document.createElement('img');logo.id='localStoreProductsLogo';logo.alt='شعار المتجر';
        logo.style.cssText='width:52px;height:52px;border-radius:14px;object-fit:cover;border:1px solid rgba(212,175,55,.38);box-shadow:0 8px 24px rgba(15,23,42,.16);margin-inline-end:10px;vertical-align:middle;';
        head.style.display='flex';head.style.alignItems='center';head.prepend(logo);
      }
      if(store.logo_url||store.logo){logo.src=String(store.logo_url||store.logo);logo.style.display='block'}else logo.style.display='none';
    }
  }

  async function bindActiveStore(storeId){
    const sid=String(storeId||'').trim();if(!sid)return;
    setActiveStoreUrl(sid);
    try{
      await coreReady;
      if(typeof window.MeshwarStoreCategoriesV9?.initStorefront==='function')await window.MeshwarStoreCategoriesV9.initStorefront(sid);
      if(typeof window.MeshwarLocalStoreGlobalSearchV12?.init==='function')await window.MeshwarLocalStoreGlobalSearchV12.init(sid);
      const rows=await rest(`local_stores?select=id,store_name,logo_url,specialty,store_type,country,governorate,commission_rate,exchange_rate,status&id=eq.${encodeURIComponent(sid)}&limit=1`);
      const store=Array.isArray(rows)?rows[0]:null;
      if(!store)return;
      window.MeshwarLocalStoreV4Context={...(window.MeshwarLocalStoreV4Context||{}),store:{...(window.MeshwarLocalStoreV4Context?.store||{}),...store}};
      bindStoreIdentity(store);
    }catch(err){console.warn('Active store bridge failed',err)}
  }

  function wrapOpenStore(){
    const original=window.openStore;if(typeof original!=='function'||original.__mwActiveStoreBridgeV3)return false;
    const wrapped=async function(storeUrl,storeId){
      const sid=String(storeId||'').trim();
      if(sid)setActiveStoreUrl(sid);
      const result=await original.apply(this,arguments);
      if(sid)await bindActiveStore(sid);
      return result;
    };
    wrapped.__mwActiveStoreBridgeV3=true;window.openStore=wrapped;return true;
  }

  if(!wrapOpenStore()){
    let attempts=0;const timer=setInterval(()=>{attempts++;if(wrapOpenStore()||attempts>80)clearInterval(timer)},50);
  }

  /* MESHWAR_CATALOG_CONSISTENCY_V25_LOADER */
  if(!document.querySelector('script[data-mw-catalog-consistency-v25]')){
    const catalog=document.createElement('script');
    catalog.src='js/catalog-price-barcode-consistency-v25.js?v=20260823-0240';
    catalog.dataset.mwCatalogConsistencyV25='1';
    catalog.onload=()=>window.MeshwarCatalogConsistencyV25?.installStorefront?.();
    catalog.onerror=()=>console.warn('تعذر تحميل طبقة توحيد أسعار الكتالوج V25.');
    document.head.appendChild(catalog);
  }
})();
