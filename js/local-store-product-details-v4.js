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
    const stores=await rest(`local_stores?select=id,store_name,commission_rate,exchange_rate,status&id=eq.${encodeURIComponent(storeId)}&limit=1`);
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
            categories.src='js/local-store-categories-v9.js?v=store-categories-v9';
            categories.dataset.mwStoreCategoriesV9='1';
            categories.onload=()=>resolveCore();
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

  /* MESHWAR_LOCAL_STORE_ACTIVE_PANEL_BRIDGE_V1 */
  function setActiveStoreUrl(storeId){
    const sid=String(storeId||'').trim();if(!sid)return;
    const url=new URL(location.href);url.searchParams.set('storeId',sid);history.replaceState(history.state,'',url);
  }

  async function bindActiveStore(storeId){
    const sid=String(storeId||'').trim();if(!sid)return;
    setActiveStoreUrl(sid);
    try{
      const rows=await rest(`local_stores?select=id,store_name,specialty,store_type,country,governorate&id=eq.${encodeURIComponent(sid)}&limit=1`);
      const store=Array.isArray(rows)?rows[0]:null;
      if(store){
        const title=document.getElementById('localStoreProductsTitle');
        const meta=document.getElementById('localStoreProductsMeta');
        if(title)title.textContent=String(store.store_name||'متجر محلي');
        if(meta)meta.textContent=[store.specialty||store.store_type,store.governorate||store.country].filter(Boolean).join(' · ');
        window.MeshwarLocalStoreV4Context={...(window.MeshwarLocalStoreV4Context||{}),store};
      }
    }catch(err){console.warn('Active store header bridge failed',err)}
    document.getElementById('mwCategoryShell')?.remove();
    document.getElementById('mwCategoryBar')?.remove();
    const panel=document.getElementById('localStoreProductsPanel');
    const grid=document.getElementById('localStoreProductsGrid');
    if(panel&&grid){
      panel.style.position=panel.style.position||'relative';
      const oldHost=document.getElementById('mwActiveStoreCategoryHost');
      if(oldHost)oldHost.remove();
    }
    const rerun=document.createElement('script');
    rerun.src='js/local-store-categories-v9.js?v=active-store-'+Date.now();
    rerun.dataset.mwStoreCategoriesV9Active='1';
    document.head.appendChild(rerun);
  }

  function wrapOpenStore(){
    const original=window.openStore;if(typeof original!=='function'||original.__mwActiveStoreBridge)return false;
    const wrapped=async function(storeUrl,storeId){
      const sid=String(storeId||'').trim();
      if(sid)setActiveStoreUrl(sid);
      const result=await original.apply(this,arguments);
      if(sid)await bindActiveStore(sid);
      return result;
    };
    wrapped.__mwActiveStoreBridge=true;window.openStore=wrapped;return true;
  }
  if(!wrapOpenStore()){
    let attempts=0;const timer=setInterval(()=>{attempts++;if(wrapOpenStore()||attempts>80)clearInterval(timer)},50);
  }
})();
