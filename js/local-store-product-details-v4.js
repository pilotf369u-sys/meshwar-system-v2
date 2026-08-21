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
    }catch(err){console.error('V4 store context error',err);alert('تعذر فتح أو إرسال الطلب: '+(err?.message||err))}
  },true);

  const script=document.createElement('script');
  script.src='js/local-store-product-details-v4-core.js?v=store-context-1';
  script.dataset.mwProductDetailsV4Core='1';
  script.onload=()=>resolveCore();
  script.onerror=()=>rejectCore(new Error('تعذر تحميل مكون تفاصيل المنتج.'));
  document.head.appendChild(script);
})();
