/* MESHWAR_CATALOG_PRICE_BARCODE_CONSISTENCY_V25 */
(function(){
  'use strict';
  const SB_URL='https://hsmmbloouskqdnptiiad.supabase.co';
  const SB_KEY='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
  const STORE_KEY='meshwar_vendor_store';
  const CACHE_PREFIX='meshwar_local_store_cache_v3_';
  const VERSION='20260823-0240';
  const q=v=>encodeURIComponent(String(v??''));
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
  const fmt=v=>Number(v||0).toLocaleString('en-US',{maximumFractionDigits:0});
  function vendorStore(win){try{return JSON.parse(win.sessionStorage.getItem(STORE_KEY)||'null')}catch{return null}}
  function productCode(p){return String(p?.barcode||p?.sku||'').trim()}
  async function request(win,path,{method='GET',body=null}={}){
    const r=await win.fetch(`${SB_URL}/rest/v1/${path}`,{method,cache:'no-store',headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`,'Content-Type':'application/json',Accept:'application/json',...(method!=='GET'?{Prefer:'return=representation'}:{})},body:body==null?null:JSON.stringify(body)});
    const t=await r.text();if(!r.ok)throw new Error(t||`HTTP ${r.status}`);return t?JSON.parse(t):null;
  }

  /* ---------- Vendor barcode canonical persistence ---------- */
  function ensureBarcodeField(win){
    const d=win.document;if(d.getElementById('productBarcode'))return d.getElementById('productBarcode');
    const name=d.getElementById('productName');if(!name)return null;
    const el=d.createElement('input');el.id='productBarcode';el.className='field';el.placeholder='الباركود';el.autocomplete='off';el.inputMode='numeric';name.insertAdjacentElement('afterend',el);return el;
  }
  async function fetchVendorProduct(win,id){
    const st=vendorStore(win);if(!st?.id||!id)return null;
    let rows=[];
    try{rows=await request(win,`local_products?select=id,product_name,barcode,sku&id=eq.${q(id)}&store_id=eq.${q(st.id)}&limit=1`)}
    catch{rows=await request(win,`local_products?select=id,product_name,barcode&id=eq.${q(id)}&store_id=eq.${q(st.id)}&limit=1`)}
    return Array.isArray(rows)?rows[0]||null:null;
  }
  async function hydrateBarcode(win,id){
    const el=ensureBarcodeField(win);if(!el||!id)return;
    const p=await fetchVendorProduct(win,id);const code=productCode(p);
    el.value=code;
    el.dataset.mwCanonicalBarcode=code;
  }
  async function resolveSavedProductId(win,{id,name}){
    if(id)return id;const st=vendorStore(win);if(!st?.id||!name)return'';
    const rows=await request(win,`local_products?select=id&store_id=eq.${q(st.id)}&product_name=eq.${q(name)}&order=created_at.desc&limit=1`);
    return String((Array.isArray(rows)?rows[0]:null)?.id||'').trim();
  }
  async function persistBarcode(win,{id,name,barcode}){
    const st=vendorStore(win),code=String(barcode||'').trim();if(!st?.id)return;
    const pid=await resolveSavedProductId(win,{id,name});if(!pid)return;
    await request(win,`local_products?id=eq.${q(pid)}&store_id=eq.${q(st.id)}`,{method:'PATCH',body:{barcode:code||null}});
    win.__mwBarcodeProductsCacheAt=0;
    try{await win.MeshwarVendorBarcodeV11?.refreshProductDecorations?.(win,true)}catch{}
  }
  function decorateVendorRows(win){
    const st=vendorStore(win);if(!st?.id)return Promise.resolve();
    return request(win,`local_products?select=id,product_name,barcode&store_id=eq.${q(st.id)}&order=created_at.desc`).then(items=>{
      const map=new Map((items||[]).map(p=>[String(p.id),p]));
      win.document.querySelectorAll('#productsBody tr').forEach(row=>{
        const code=String(row.querySelector('button[onclick*="editProduct("]')?.getAttribute('onclick')||'');
        const id=code.match(/editProduct\(['"]([^'"]+)['"]\)/)?.[1]||'',p=map.get(String(id));if(!p)return;
        let label=row.querySelector('[data-mw-barcode-label]');if(!label){label=win.document.createElement('div');label.dataset.mwBarcodeLabel='1';label.className='mt-1 text-[11px] font-bold text-amber-300';row.querySelector('td')?.appendChild(label)}
        const bc=productCode(p);label.textContent=bc?`باركود: ${bc}`:'بدون باركود';label.style.opacity=bc?'1':'.6';
        row.dataset.mwSearch=[p.product_name,bc].filter(Boolean).join(' ').toLowerCase();
      });
    }).catch(e=>console.warn('V25 barcode row refresh failed',e));
  }
  function bindVendor(win){
    ensureBarcodeField(win);
    if(!win.__mwV25VendorCapture){
      win.document.addEventListener('click',e=>{
        const edit=e.target?.closest?.('button[onclick*="editProduct("]');
        if(edit){const code=String(edit.getAttribute('onclick')||''),id=code.match(/editProduct\(['"]([^'"]+)['"]\)/)?.[1]||'';if(id)[0,100,350,800].forEach(ms=>setTimeout(()=>hydrateBarcode(win,id).catch(()=>{}),ms));return}
        const btn=e.target?.closest?.('button');if(!btn)return;const onclick=String(btn.getAttribute('onclick')||''),text=String(btn.textContent||'');
        if(!onclick.includes('saveProduct')&&!text.includes('حفظ المنتج'))return;
        const id=String(win.document.getElementById('productId')?.value||'').trim(),name=String(win.document.getElementById('productName')?.value||'').trim(),barcode=String(ensureBarcodeField(win)?.value||'').trim();
        const save=()=>persistBarcode(win,{id,name,barcode}).then(()=>decorateVendorRows(win)).catch(err=>console.warn('V25 canonical barcode save failed',err));
        if(id)setTimeout(save,80);else[220,650,1300].forEach(ms=>setTimeout(save,ms));
      },true);
      win.__mwV25VendorCapture=true;
    }
    if(!win.__mwV25VendorObserver){const ob=new win.MutationObserver(()=>{ensureBarcodeField(win);decorateVendorRows(win)});ob.observe(win.document.documentElement,{childList:true,subtree:true});win.__mwV25VendorObserver=ob}
    decorateVendorRows(win);
  }
  function installVendor(win){if(!win)return;const boot=()=>bindVendor(win);if(win.document.readyState==='loading')win.document.addEventListener('DOMContentLoaded',boot,{once:true});else boot()}

  /* ---------- Storefront canonical price refresh ---------- */
  function clearStaleStoreCache(storeId){
    try{
      if(storeId)localStorage.removeItem(CACHE_PREFIX+String(storeId));
      else for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(k?.startsWith(CACHE_PREFIX))localStorage.removeItem(k)}
    }catch{}
  }
  function activeStoreId(){return String(new URLSearchParams(location.search).get('storeId')||window.MeshwarLocalStoreV4Context?.store?.id||'').trim()}
  function pricing(){return window.MeshwarLocalPricing}
  function finalVendorPrice(p){const d=p?.discount_price,b=p?.base_price;const dn=num(d),bn=num(b);return d!==null&&d!==''&&dn!==null&&dn>=0?dn:bn}
  function validDiscount(p){const b=num(p?.base_price),d=num(p?.discount_price);return p?.discount_price!==null&&p?.discount_price!==''&&b!==null&&d!==null&&b>0&&d>=0&&d<b}
  function localPrice(p,store){const P=pricing(),v=finalVendorPrice(p),rate=num(store?.exchange_rate);if(!P||v===null||rate===null||rate<=0)return null;return P.customerPriceLocal(v,store?.commission_rate,rate)}
  function oldLocalPrice(p,store){const P=pricing(),b=num(p?.base_price),rate=num(store?.exchange_rate);if(!P||!validDiscount(p)||b===null||rate===null||rate<=0)return null;return P.customerPriceLocal(b,store?.commission_rate,rate)}
  async function fetchFreshBundle(storeId){
    const [stores,products]=await Promise.all([
      request(window,`local_stores?select=id,store_name,commission_rate,exchange_rate,status&id=eq.${q(storeId)}&status=eq.active&limit=1`),
      request(window,`local_products?select=id,base_price,discount_price,updated_at&store_id=eq.${q(storeId)}&order=created_at.desc`)
    ]);
    const store=Array.isArray(stores)?stores[0]:null;if(!store)throw new Error('Store pricing source unavailable');
    return{store,products:Array.isArray(products)?products:[]};
  }
  function replacePrice(card,p,store){
    const price=localPrice(p,store),box=card.querySelector('.local-v3-price');if(!box)return;
    if(price===null){box.textContent='تعذر تحديد السعر الحالي';card.querySelector('.local-v3-order')?.setAttribute('disabled','');return}
    card.querySelector('.local-v3-old-row')?.remove();card.querySelector('.local-v3-discount-badge')?.remove();
    const moneyEl=card.querySelector('.local-v3-local .local-v3-money');if(moneyEl)moneyEl.textContent=`IQD ${fmt(price)}`;
    if(validDiscount(p)){
      const old=oldLocalPrice(p,store),pct=pricing()?.discountPercent?.(p.base_price,p.discount_price);
      if(old!==null){const row=document.createElement('div');row.className='local-v3-old-row';row.innerHTML=`<span class="local-v3-old" dir="ltr">IQD ${fmt(old)}</span>`;card.querySelector('.local-v3-local')?.insertAdjacentElement('beforebegin',row)}
      if(pct!=null){const badge=document.createElement('span');badge.className='local-v3-discount-badge';badge.textContent=`خصم ${pct}%`;card.prepend(badge)}
    }
    card.dataset.mwPriceSource='supabase-fresh-v25';
  }
  async function refreshStorefrontPrices(storeId){
    const sid=String(storeId||activeStoreId()).trim();if(!sid)return;
    clearStaleStoreCache(sid);
    const grid=document.getElementById('localStoreProductsGrid');
    try{
      const {store,products}=await fetchFreshBundle(sid),map=new Map(products.map(p=>[String(p.id),p]));
      grid?.querySelectorAll('[data-product-card]').forEach(card=>{const p=map.get(String(card.dataset.productCard));if(p)replacePrice(card,p,store)});
      grid?.querySelector('.local-v3-cache-note')?.remove();
      window.__mwStorefrontCanonicalPricing={storeId:sid,updatedAt:Date.now(),count:products.length};
    }catch(err){
      console.warn('V25 fresh storefront pricing failed',err);
      if(grid?.querySelector('.local-v3-cache-note')){
        grid.querySelectorAll('[data-product-card]').forEach(card=>{const box=card.querySelector('.local-v3-price');if(box)box.innerHTML='<div class="local-v3-note">تعذر تحديث السعر من المصدر الآن. أعد المحاولة.</div>';const btn=card.querySelector('.local-v3-order');if(btn)btn.disabled=true});
      }
    }
  }
  function wrapStorefrontLoader(){
    const fn=window.loadLocalStoreProductsV3;if(typeof fn!=='function'||fn.__mwV25)return false;
    const wrapped=async function(storeId){const sid=String(storeId||activeStoreId()).trim();clearStaleStoreCache(sid);const r=await fn.apply(this,arguments);await refreshStorefrontPrices(sid);return r};wrapped.__mwV25=true;window.loadLocalStoreProductsV3=wrapped;return true;
  }
  function wrapOpenStore(){
    const fn=window.openStore;if(typeof fn!=='function'||fn.__mwCatalogV25)return false;
    const wrapped=async function(url,storeId){const sid=String(storeId||'').trim();clearStaleStoreCache(sid);const r=await fn.apply(this,arguments);if(sid)await refreshStorefrontPrices(sid);return r};wrapped.__mwCatalogV25=true;window.openStore=wrapped;return true;
  }
  function installStorefront(){
    clearStaleStoreCache();let tries=0;const timer=setInterval(()=>{tries++;const a=wrapStorefrontLoader(),b=wrapOpenStore();if((a||window.loadLocalStoreProductsV3?.__mwV25)&&(b||window.openStore?.__mwCatalogV25)||tries>120)clearInterval(timer)},50);
    if(!window.__mwV25StoreObserver){const ob=new MutationObserver(()=>{const sid=activeStoreId();if(sid&&document.querySelector('#localStoreProductsGrid [data-product-card]')){clearTimeout(window.__mwV25PriceTimer);window.__mwV25PriceTimer=setTimeout(()=>refreshStorefrontPrices(sid),100)}});ob.observe(document.documentElement,{childList:true,subtree:true});window.__mwV25StoreObserver=ob}
  }

  window.MeshwarCatalogConsistencyV25={installVendor,installStorefront,hydrateBarcode,persistBarcode,refreshStorefrontPrices,VERSION};
  if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installStorefront,{once:true});else installStorefront()}
})();
