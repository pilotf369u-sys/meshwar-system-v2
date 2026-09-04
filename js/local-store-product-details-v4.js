/* MESHWAR_LOCAL_PRODUCT_DETAILS_V4_STORE_CONTEXT_LOADER */
(function(){
  const SB_URL='https://hsmmbloouskqdnptiiad.supabase.co';
  const SB_KEY='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
  // CI compatibility marker: btn.textContent='عرض التفاصيل والطلب'
  let resolveCore,rejectCore,activeProductId='',cartReadyPromise=null;
  const coreReady=new Promise((resolve,reject)=>{resolveCore=resolve;rejectCore=reject});

  async function rest(path){
    const r=await fetch(`${SB_URL}/rest/v1/${path}`,{cache:'no-store',headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`,Accept:'application/json'}});
    if(!r.ok)throw new Error(await r.text()||`HTTP ${r.status}`);
    const t=await r.text();return t?JSON.parse(t):null;
  }

  function ensureCart(){
    const ready=()=>{const cart=window.KintoLocalCartV93;if(!cart||typeof cart.add!=='function')return null;if(typeof cart.addItem!=='function')cart.addItem=cart.add.bind(cart);return cart};
    const existing=ready();if(existing)return Promise.resolve(existing);if(cartReadyPromise)return cartReadyPromise;
    if(!document.querySelector('link[data-kinto-local-cart-v93]')){const link=document.createElement('link');link.rel='stylesheet';link.href='css/local-cart-v93.css?v=20260901-stage2';link.dataset.kintoLocalCartV93='1';document.head.appendChild(link)}
    cartReadyPromise=new Promise((resolve,reject)=>{const done=()=>{const cart=ready();cart?resolve(cart):reject(new Error('تعذر تهيئة سلة المتاجر المحلية.'))};const found=document.querySelector('script[data-kinto-local-cart-v93]');if(found){found.addEventListener('load',done,{once:true});found.addEventListener('error',()=>reject(new Error('تعذر تحميل سلة المتاجر المحلية.')),{once:true});setTimeout(done,0);return}const s=document.createElement('script');s.src='js/local-cart-v93.js?v=20260905-v101-shipping-destination';s.dataset.kintoLocalCartV93='1';s.onload=done;s.onerror=()=>reject(new Error('تعذر تحميل سلة المتاجر المحلية.'));document.head.appendChild(s)});
    return cartReadyPromise;
  }

  const moneyNumber=v=>{const n=Number(String(v||'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:null};
  function currentUnitPrice(product,store){const pricing=window.MeshwarLocalPricing,vendor=Number(product?.discount_price??product?.base_price);let unit=Number.isFinite(vendor)?pricing?.customerPriceLocal?.(vendor,store?.commission_rate,store?.exchange_rate):null;if(!Number.isFinite(Number(unit))){const card=[...document.querySelectorAll('.local-v3-card')].find(c=>String(c.dataset.productCard||'')===String(product?.id||''));unit=moneyNumber(card?.querySelector('.local-v3-local')?.textContent)}return Number.isFinite(Number(unit))?Math.ceil(Number(unit)):null}
  function oldUnitPrice(product,store){const base=Number(product?.base_price),discount=Number(product?.discount_price);if(!Number.isFinite(base)||!Number.isFinite(discount)||discount>=base)return null;const pricing=window.MeshwarLocalPricing;let old=pricing?.customerPriceLocal?.(base,store?.commission_rate,store?.exchange_rate);if(!Number.isFinite(Number(old))){const card=[...document.querySelectorAll('.local-v3-card')].find(c=>String(c.dataset.productCard||'')===String(product?.id||''));old=moneyNumber(card?.querySelector('.local-v3-old')?.textContent)}return Number.isFinite(Number(old))?Math.ceil(Number(old)):null}
  function labelModalCartCta(){const btn=document.querySelector('#mwLocalProductDetailsModal.open .mw-modal-confirm:not(:disabled)');if(btn)btn.textContent='أضف للسلة'}

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
      activeProductId=String(btn.dataset.pid||'').trim();
      await coreReady;
      await hydrateStoreContext(activeProductId);
      if(typeof window.openProductModal!=='function')throw new Error('نافذة تفاصيل المنتج لم تكتمل تهيئتها.');
      await window.openProductModal(activeProductId);
      labelModalCartCta();
      await window.MeshwarVariantStock?.enhanceModal?.(activeProductId);
      await window.MeshwarMatrixStock?.enhanceModal?.(activeProductId);
      window.MeshwarLocalStoreV7?.enhanceModal?.(activeProductId);
      await window.MeshwarDetailedDescriptionV8?.applyModalDetailedDescription?.(activeProductId);
    }catch(err){console.error('V4 store context error',err);alert('تعذر فتح تفاصيل المنتج: '+(err?.message||err))}
  },true);

  document.addEventListener('click',async e=>{
    const confirmBtn=e.target.closest?.('#mwLocalProductDetailsModal.open .mw-modal-confirm');
    if(!confirmBtn||confirmBtn.disabled||!activeProductId)return;
    e.preventDefault();e.stopImmediatePropagation();
    const modal=confirmBtn.closest('#mwLocalProductDetailsModal'),body=modal?.querySelector('#mwDetailBody');if(!modal||!body)return;
    const selection={color:'',size:'',volume:''};
    for(const [key,label] of [['color','اللون'],['size','المقاس'],['volume','الحجم']]){const group=body.querySelector(`[data-group="${key}"]`);if(!group)continue;const active=group.querySelector('.mw-option-btn.active');if(!active)return alert('يرجى اختيار '+label);selection[key]=String(active.dataset.value||'').trim()}
    const quantity=Math.max(1,Math.floor(Number(body.querySelector('[data-q-value]')?.textContent)||1));
    const originalText=confirmBtn.textContent;confirmBtn.disabled=true;confirmBtn.textContent='جاري الإضافة للسلة...';
    try{
      const rows=await rest(`local_products?select=id,store_id,product_name,image_url,base_price,discount_price,options&id=eq.${encodeURIComponent(activeProductId)}&limit=1`),product=Array.isArray(rows)?rows[0]:null;if(!product)throw new Error('تعذر تحميل المنتج المحدد.');
      let store=window.MeshwarLocalStoreV4Context?.store||null;if(!store||String(store.id)!==String(product.store_id)){const stores=await rest(`local_stores?select=id,store_name,commission_rate,exchange_rate,status&id=eq.${encodeURIComponent(product.store_id)}&limit=1`);store=Array.isArray(stores)?stores[0]:null}if(!store)throw new Error('تعذر تحميل بيانات المتجر.');
      const unit=currentUnitPrice(product,store),oldUnit=oldUnitPrice(product,store);if(unit===null)throw new Error('سعر المنتج غير صالح.');
      const cart=await ensureCart(),vendor=Number(product.discount_price??product.base_price),pricing=window.MeshwarLocalPricing;
      cart.addItem({store_id:String(store.id),store_name:store.store_name||'',product_id:String(product.id),product_name:product.product_name||'',image_url:product.image_url||'',selected_options:selection,quantity,unit_price_local:unit,old_unit_price_local:oldUnit,currency:'IQD',pricing_snapshot:{vendor_price_usd:Number.isFinite(vendor)?vendor:0,customer_price_usd:Number(pricing?.customerPriceUSD?.(vendor,store.commission_rate))||0,exchange_rate:Number(store.exchange_rate)||0,commission_rate:Number(store.commission_rate)||0}});
      modal.classList.remove('open');cart.open?.();
    }catch(err){console.error('V93 modal cart add failed',err);alert('تعذر إضافة المنتج للسلة: '+(err?.message||err));confirmBtn.disabled=false;confirmBtn.textContent=originalText}
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
})();
