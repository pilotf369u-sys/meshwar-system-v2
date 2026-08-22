/* MESHWAR_VENDOR_BARCODE_SMART_SEARCH_V11 */
(function(){
  const SB_URL='https://hsmmbloouskqdnptiiad.supabase.co';
  const SB_KEY='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';

  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
  function storeId(win){try{return String(JSON.parse(win.sessionStorage.getItem('meshwar_vendor_store')||'null')?.id||'').trim()}catch{return''}}

  async function rest(win,path){
    const r=await win.fetch(`${SB_URL}/rest/v1/${path}`,{cache:'no-store',headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`,Accept:'application/json'}});
    if(!r.ok)throw new Error(await r.text()||`HTTP ${r.status}`);
    const t=await r.text();return t?JSON.parse(t):null;
  }

  function injectUi(win){
    const d=win.document;
    if(d.getElementById('productBarcode'))return;
    const name=d.getElementById('productName');
    if(name){
      const input=d.createElement('input');
      input.id='productBarcode';input.className='field';input.placeholder='الباركود';input.autocomplete='off';input.inputMode='numeric';
      name.insertAdjacentElement('afterend',input);
    }
    const productsPanel=d.getElementById('vendorTab-products');
    const tableWrap=productsPanel?.querySelector('.vendor-table-wrap');
    if(tableWrap&&!d.getElementById('vendorSmartProductSearch')){
      const box=d.createElement('div');box.className='mb-3 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3';
      box.innerHTML=`<div class="mb-2 text-xs font-black text-amber-200">🔎 بحث ذكي / ماسح باركود</div><input id="vendorSmartProductSearch" class="field" placeholder="امسح الباركود أو اكتب الباركود / اسم المنتج ثم Enter" autocomplete="off"><div id="vendorSmartProductSearchHint" class="mt-2 text-xs text-slate-400">Enter: فتح المنتج المطابق، أو بدء إضافة منتج جديد إذا كان الباركود غير مسجل.</div>`;
      tableWrap.parentElement?.insertBefore(box,tableWrap);
      d.getElementById('vendorSmartProductSearch')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();handleSearch(win).catch(err=>{console.error(err);win.alert('تعذر تنفيذ البحث: '+(err?.message||err))})}});
    }
  }

  function installFetchBridge(win){
    if(win.__mwBarcodeFetchBridge)return;
    const originalFetch=win.fetch.bind(win);
    win.fetch=async function(input,init){
      try{
        const url=typeof input==='string'?input:String(input?.url||'');
        const method=String(init?.method||input?.method||'GET').toUpperCase();
        if(/\/rest\/v1\/local_products(?:\?|$)/.test(url)&&['POST','PATCH'].includes(method)&&init?.body){
          const barcode=String(win.document.getElementById('productBarcode')?.value||'').trim()||null;
          let body=JSON.parse(init.body);
          const merge=x=>x&&typeof x==='object'&&!Array.isArray(x)?{...x,barcode}:x;
          body=Array.isArray(body)?body.map(merge):merge(body);
          init={...init,body:JSON.stringify(body)};
        }
      }catch(e){console.warn('Barcode payload bridge skipped',e)}
      return originalFetch(input,init);
    };
    win.__mwBarcodeFetchBridge=true;
  }

  function wrapProductFunctions(win){
    if(typeof win.openProductModal==='function'&&!win.openProductModal.__mwBarcode){
      const original=win.openProductModal;
      const wrapped=function(){const r=original.apply(this,arguments);setTimeout(()=>{const el=win.document.getElementById('productBarcode');if(el&&!win.document.getElementById('productId')?.value)el.value=''},0);return r};
      wrapped.__mwBarcode=true;win.openProductModal=wrapped;
    }
    if(typeof win.editProduct==='function'&&!win.editProduct.__mwBarcode){
      const original=win.editProduct;
      const wrapped=function(id){const r=original.apply(this,arguments);setTimeout(async()=>{try{const sid=storeId(win);if(!sid)return;const rows=await rest(win,`local_products?select=id,barcode&id=eq.${encodeURIComponent(id)}&store_id=eq.${encodeURIComponent(sid)}&limit=1`);const p=Array.isArray(rows)?rows[0]:null;const el=win.document.getElementById('productBarcode');if(el)el.value=String(p?.barcode||'')}catch(e){console.warn('Barcode edit hydrate failed',e)}},0);return r};
      wrapped.__mwBarcode=true;win.editProduct=wrapped;
    }
  }

  async function handleSearch(win){
    const d=win.document,input=d.getElementById('vendorSmartProductSearch');
    const value=String(input?.value||'').trim();if(!value)return;
    const sid=storeId(win);if(!sid)throw new Error('تعذر تحديد المتجر الحالي.');
    const exact=await rest(win,`local_products?select=id,product_name,barcode&store_id=eq.${encodeURIComponent(sid)}&barcode=eq.${encodeURIComponent(value)}&limit=1`);
    const byBarcode=Array.isArray(exact)?exact[0]:null;
    if(byBarcode){win.editProduct?.(byBarcode.id);if(input)input.value='';return}
    const byName=await rest(win,`local_products?select=id,product_name,barcode&store_id=eq.${encodeURIComponent(sid)}&product_name=ilike.${encodeURIComponent('%'+value+'%')}&limit=5`);
    if(Array.isArray(byName)&&byName.length===1){win.editProduct?.(byName[0].id);if(input)input.value='';return}
    const looksBarcode=/^[A-Za-z0-9._-]{4,80}$/.test(value);
    if(looksBarcode){win.openProductModal?.();setTimeout(()=>{const el=d.getElementById('productBarcode');if(el){el.value=value;el.focus()}},0);if(input)input.value='';return}
    if(Array.isArray(byName)&&byName.length>1){
      const hint=d.getElementById('vendorSmartProductSearchHint');if(hint)hint.innerHTML='نتائج متعددة: '+byName.map(p=>esc(p.product_name)).join(' • ');return;
    }
    const hint=d.getElementById('vendorSmartProductSearchHint');if(hint)hint.textContent='لا يوجد منتج مطابق بهذا الاسم.';
  }

  function install(win){
    if(!win||win.__mwVendorBarcodeInstalled)return;
    const boot=()=>{
      injectUi(win);installFetchBridge(win);wrapProductFunctions(win);
      if(!win.__mwBarcodeObserver){const ob=new win.MutationObserver(()=>{injectUi(win);wrapProductFunctions(win)});ob.observe(win.document.documentElement,{childList:true,subtree:true});win.__mwBarcodeObserver=ob}
      win.__mwVendorBarcodeInstalled=true;
    };
    if(win.document.readyState==='loading')win.document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  }

  window.MeshwarVendorBarcodeV11={install};
})();
