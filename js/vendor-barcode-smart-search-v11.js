/* MESHWAR_VENDOR_BARCODE_SMART_SEARCH_V11 */
(function(){
  const SB_URL='https://hsmmbloouskqdnptiiad.supabase.co';
  const SB_KEY='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';

  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[c]))}
  function storeId(win){try{return String(JSON.parse(win.sessionStorage.getItem('meshwar_vendor_store')||'null')?.id||'').trim()}catch{return''}}

  async function rest(win,path){
    const r=await win.fetch(`${SB_URL}/rest/v1/${path}`,{cache:'no-store',headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`,Accept:'application/json'}});
    if(!r.ok)throw new Error(await r.text()||`HTTP ${r.status}`);
    const t=await r.text();return t?JSON.parse(t):null;
  }

  function productIdFromRow(row){
    const btn=row?.querySelector('button[onclick*="editProduct("]');
    const code=String(btn?.getAttribute('onclick')||'');
    return code.match(/editProduct\(['"]([^'"]+)['"]\)/)?.[1]||'';
  }

  function ensureBarcodeColumn(win){
    const d=win.document,table=d.querySelector('#productsBody')?.closest('table');
    if(!table)return;
    const headRow=table.querySelector('thead tr');
    if(headRow&&!headRow.querySelector('[data-mw-barcode-head]')){
      const th=d.createElement('th');
      th.dataset.mwBarcodeHead='1';
      th.textContent='الباركود';
      const first=headRow.children[0];
      if(first)first.insertAdjacentElement('afterend',th);else headRow.appendChild(th);
    }
    d.querySelectorAll('#productsBody tr').forEach(row=>{
      if(!row.querySelector('button[onclick*="editProduct("]'))return;
      row.querySelector('[data-mw-barcode-label]')?.remove();
      if(!row.querySelector('[data-mw-barcode-cell]')){
        const td=d.createElement('td');
        td.dataset.mwBarcodeCell='1';
        td.className='text-center text-xs font-bold text-amber-200';
        td.setAttribute('dir','ltr');
        const first=row.children[0];
        if(first)first.insertAdjacentElement('afterend',td);else row.appendChild(td);
      }
    });
    const empty=d.querySelector('#productsBody tr:not(:has(button[onclick*="editProduct("])) td[colspan]');
    if(empty)empty.colSpan=7;
  }

  function filterExistingRows(win){
    const d=win.document;
    const q=String(d.getElementById('vendorSmartProductSearch')?.value||'').trim().toLowerCase();
    d.querySelectorAll('#productsBody tr').forEach(row=>{
      if(!row.querySelector('button[onclick*="editProduct("]'))return;
      const hay=String(row.dataset.mwSearch||row.textContent||'').toLowerCase();
      row.style.display=!q||hay.includes(q)?'':'none';
    });
  }

  function resetSearchInput(win,{focus=false}={}){
    const d=win.document,input=d.getElementById('vendorSmartProductSearch');
    if(!input)return;
    input.value='';
    filterExistingRows(win);
    const hint=d.getElementById('vendorSmartProductSearchHint');
    if(hint)hint.textContent='البحث الفوري يخفي/يظهر الصفوف الأصلية دون إعادة بناء بيانات المخزون. Enter يفتح المنتج المطابق أو يبدأ إضافة باركود جديد.';
    if(focus)setTimeout(()=>{try{input.focus();input.select?.()}catch{}},60);
  }

  function refocusSearchInput(win){
    const input=win.document.getElementById('vendorSmartProductSearch');
    if(!input)return;
    setTimeout(()=>{try{input.focus();input.select?.()}catch{}},60);
  }

  function decorateRows(win,items){
    const d=win.document,map=new Map((items||[]).map(p=>[String(p.id),p]));
    ensureBarcodeColumn(win);
    d.querySelectorAll('#productsBody tr').forEach(row=>{
      const id=productIdFromRow(row),p=map.get(String(id));if(!p)return;
      const barcode=String(p.barcode||'').trim();
      row.dataset.mwSearch=[p.product_name,barcode].filter(Boolean).join(' ').toLowerCase();
      const cell=row.querySelector('[data-mw-barcode-cell]');
      if(cell){
        cell.textContent=barcode||'بدون باركود';
        cell.style.opacity=barcode?'1':'.6';
      }
    });
    filterExistingRows(win);
  }

  async function refreshProductDecorations(win,force=false){
    const sid=storeId(win);if(!sid)return;
    const now=Date.now();
    if(!force&&win.__mwBarcodeProductsCache&&now-(win.__mwBarcodeProductsCacheAt||0)<2500){
      decorateRows(win,win.__mwBarcodeProductsCache);return;
    }
    if(win.__mwBarcodeRefreshPromise)return win.__mwBarcodeRefreshPromise;
    win.__mwBarcodeRefreshPromise=(async()=>{
      try{
        const rows=await rest(win,`local_products?select=id,product_name,barcode,stock_quantity&store_id=eq.${encodeURIComponent(sid)}&order=created_at.desc`);
        win.__mwBarcodeProductsCache=Array.isArray(rows)?rows:[];
        win.__mwBarcodeProductsCacheAt=Date.now();
        decorateRows(win,win.__mwBarcodeProductsCache);
      }catch(e){console.warn('Barcode row decoration failed',e)}
      finally{win.__mwBarcodeRefreshPromise=null}
    })();
    return win.__mwBarcodeRefreshPromise;
  }

  function scheduleRefresh(win,force=false){
    clearTimeout(win.__mwBarcodeRefreshTimer);
    win.__mwBarcodeRefreshTimer=setTimeout(()=>refreshProductDecorations(win,force),120);
  }

  function injectUi(win){
    const d=win.document;
    if(!d.getElementById('productBarcode')){
      const name=d.getElementById('productName');
      if(name){
        const input=d.createElement('input');
        input.id='productBarcode';input.className='field';input.placeholder='الباركود';input.autocomplete='off';input.inputMode='numeric';
        name.insertAdjacentElement('afterend',input);
      }
    }
    ensureBarcodeColumn(win);
    const productsPanel=d.getElementById('vendorTab-products');
    const tableWrap=productsPanel?.querySelector('.vendor-table-wrap');
    if(tableWrap&&!d.getElementById('vendorSmartProductSearch')){
      const box=d.createElement('div');box.className='mb-3 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3';
      box.innerHTML=`<div class="mb-2 text-xs font-black text-amber-200">🔎 بحث ذكي / ماسح باركود</div><input id="vendorSmartProductSearch" class="field" placeholder="امسح الباركود أو اكتب الباركود / اسم المنتج ثم Enter" autocomplete="off"><div id="vendorSmartProductSearchHint" class="mt-2 text-xs text-slate-400">البحث الفوري يخفي/يظهر الصفوف الأصلية دون إعادة بناء بيانات المخزون. Enter يفتح المنتج المطابق أو يبدأ إضافة باركود جديد.</div>`;
      tableWrap.parentElement?.insertBefore(box,tableWrap);
      const input=d.getElementById('vendorSmartProductSearch');
      input?.addEventListener('input',()=>filterExistingRows(win));
      input?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();handleSearch(win).catch(err=>{console.error(err);win.alert('تعذر تنفيذ البحث: '+(err?.message||err));refocusSearchInput(win)})}});
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
          win.__mwBarcodeProductsCacheAt=0;
          scheduleRefresh(win,true);
        }
      }catch(e){console.warn('Barcode payload bridge skipped',e)}
      return originalFetch(input,init);
    };
    win.__mwBarcodeFetchBridge=true;
  }

  async function hydrateBarcodeForEdit(win,id){
    try{
      const sid=storeId(win);if(!sid)return;
      let p=(win.__mwBarcodeProductsCache||[]).find(x=>String(x.id)===String(id));
      if(!p){
        const rows=await rest(win,`local_products?select=id,barcode,stock_quantity&id=eq.${encodeURIComponent(id)}&store_id=eq.${encodeURIComponent(sid)}&limit=1`);
        p=Array.isArray(rows)?rows[0]:null;
      }
      const el=win.document.getElementById('productBarcode');
      if(el)el.value=String(p?.barcode||'');
    }catch(e){console.warn('Barcode edit hydrate failed',e)}
  }

  function wrapProductFunctions(win){
    if(typeof win.openProductModal==='function'&&!win.openProductModal.__mwBarcode){
      const original=win.openProductModal;
      const wrapped=function(){
        const r=original.apply(this,arguments);
        setTimeout(()=>{const el=win.document.getElementById('productBarcode');if(el&&!win.document.getElementById('productId')?.value)el.value=''},0);
        return r
      };
      wrapped.__mwBarcode=true;win.openProductModal=wrapped;
    }
    if(typeof win.closeProductModal==='function'&&!win.closeProductModal.__mwBarcodeFocus){
      const original=win.closeProductModal;
      const wrapped=function(){
        const r=original.apply(this,arguments);
        resetSearchInput(win,{focus:true});
        return r
      };
      wrapped.__mwBarcodeFocus=true;win.closeProductModal=wrapped;
    }
    if(typeof win.editProduct==='function'&&!win.editProduct.__mwBarcode){
      const original=win.editProduct;
      const wrapped=function(id){
        const r=original.apply(this,arguments);
        hydrateBarcodeForEdit(win,id);
        setTimeout(()=>hydrateBarcodeForEdit(win,id),120);
        setTimeout(()=>hydrateBarcodeForEdit(win,id),450);
        return r
      };
      wrapped.__mwBarcode=true;win.editProduct=wrapped;
    }
    if(typeof win.loadProducts==='function'&&!win.loadProducts.__mwBarcode){
      const original=win.loadProducts;
      const wrapped=async function(){
        const r=await original.apply(this,arguments);
        win.__mwBarcodeProductsCacheAt=0;
        await refreshProductDecorations(win,true);
        return r
      };
      wrapped.__mwBarcode=true;win.loadProducts=wrapped;
    }
  }

  async function handleSearch(win){
    const d=win.document,input=d.getElementById('vendorSmartProductSearch');
    const value=String(input?.value||'').trim();if(!value){refocusSearchInput(win);return}
    const sid=storeId(win);if(!sid)throw new Error('تعذر تحديد المتجر الحالي.');
    const exact=await rest(win,`local_products?select=id,product_name,barcode,stock_quantity&store_id=eq.${encodeURIComponent(sid)}&barcode=eq.${encodeURIComponent(value)}&limit=1`);
    const byBarcode=Array.isArray(exact)?exact[0]:null;
    if(byBarcode){resetSearchInput(win);win.editProduct?.(byBarcode.id);return}
    const byName=await rest(win,`local_products?select=id,product_name,barcode,stock_quantity&store_id=eq.${encodeURIComponent(sid)}&product_name=ilike.${encodeURIComponent('%'+value+'%')}&limit=5`);
    if(Array.isArray(byName)&&byName.length===1){resetSearchInput(win);win.editProduct?.(byName[0].id);return}
    const looksBarcode=/^[A-Za-z0-9._-]{4,80}$/.test(value);
    if(looksBarcode){
      resetSearchInput(win);
      win.openProductModal?.();
      setTimeout(()=>{const el=d.getElementById('productBarcode');if(el){el.value=value;el.focus()}},0);
      return;
    }
    if(Array.isArray(byName)&&byName.length>1){
      const hint=d.getElementById('vendorSmartProductSearchHint');
      if(hint)hint.innerHTML='نتائج متعددة معروضة في الجدول: '+byName.map(p=>esc(p.product_name)).join(' • ');
      refocusSearchInput(win);
      return;
    }
    const hint=d.getElementById('vendorSmartProductSearchHint');
    if(hint)hint.textContent='لا يوجد منتج مطابق بهذا الاسم.';
    refocusSearchInput(win);
  }

  function install(win){
    if(!win||win.__mwVendorBarcodeInstalled)return;
    const boot=()=>{
      injectUi(win);installFetchBridge(win);wrapProductFunctions(win);scheduleRefresh(win,true);
      if(!win.__mwBarcodeObserver){
        const ob=new win.MutationObserver(()=>{injectUi(win);wrapProductFunctions(win);scheduleRefresh(win)});
        ob.observe(win.document.documentElement,{childList:true,subtree:true});
        win.__mwBarcodeObserver=ob;
      }
      win.__mwVendorBarcodeInstalled=true;
    };
    if(win.document.readyState==='loading')win.document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  }

  window.MeshwarVendorBarcodeV11={install};
})();
