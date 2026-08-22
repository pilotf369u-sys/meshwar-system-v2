/* MESHWAR_VENDOR_BARCODE_MARGIN_AUTOPRICING_V22 */
(function(){
  'use strict';
  const SB_URL='https://hsmmbloouskqdnptiiad.supabase.co';
  const SB_KEY='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
  const STORE_KEY='meshwar_vendor_store';
  const VERSION='20260823-legacy-sku-fallback';

  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
  const q=v=>encodeURIComponent(String(v??''));
  function store(win){try{return JSON.parse(win.sessionStorage.getItem(STORE_KEY)||'null')}catch{return null}}
  function saveStore(win,s){try{win.sessionStorage.setItem(STORE_KEY,JSON.stringify(s))}catch{}}
  function productCode(p){return String(p?.barcode||p?.sku||'').trim()}

  async function rest(win,path,{method='GET',body=null}={}){
    const r=await win.fetch(`${SB_URL}/rest/v1/${path}`,{method,cache:'no-store',headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`,'Content-Type':'application/json',Accept:'application/json'},body:body==null?null:JSON.stringify(body)});
    const t=await r.text();if(!r.ok)throw new Error(t||`HTTP ${r.status}`);return t?JSON.parse(t):null;
  }
  async function rpc(win,name,body){return rest(win,`rpc/${name}`,{method:'POST',body})}

  async function fetchBarcodeRows(win){
    const sid=String(store(win)?.id||'').trim();if(!sid)return[];
    try{return await rest(win,`local_products?select=id,product_name,barcode,sku,stock_quantity&store_id=eq.${q(sid)}&order=created_at.desc`)||[]}
    catch{return await rest(win,`local_products?select=id,product_name,barcode,stock_quantity&store_id=eq.${q(sid)}&order=created_at.desc`)||[]}
  }
  async function decorateBarcodes(win){
    const rows=await fetchBarcodeRows(win),map=new Map(rows.map(p=>[String(p.id),p]));
    win.document.querySelectorAll('#productsBody tr').forEach(row=>{
      const onclick=String(row.querySelector('button[onclick*="editProduct("]')?.getAttribute('onclick')||'');
      const id=onclick.match(/editProduct\(['"]([^'"]+)['"]\)/)?.[1]||'',p=map.get(String(id));if(!p)return;
      const code=productCode(p);row.dataset.mwSearch=[p.product_name,p.barcode,p.sku].filter(Boolean).join(' ').toLowerCase();
      let label=row.querySelector('[data-mw-barcode-label]');if(!label){label=win.document.createElement('div');label.dataset.mwBarcodeLabel='1';label.className='mt-1 text-[11px] font-bold text-amber-300';row.querySelector('td')?.appendChild(label)}
      if(label){label.textContent=code?`باركود: ${code}`:'بدون باركود';label.style.opacity=code?'1':'.6'}
    });
  }
  async function hydrateBarcode(win,id){
    const sid=String(store(win)?.id||'').trim();if(!sid||!id)return;
    let rows=[];
    try{rows=await rest(win,`local_products?select=id,barcode,sku&id=eq.${q(id)}&store_id=eq.${q(sid)}&limit=1`)||[]}
    catch{rows=await rest(win,`local_products?select=id,barcode&id=eq.${q(id)}&store_id=eq.${q(sid)}&limit=1`)||[]}
    let code=productCode(rows[0]);
    if(!code){const cached=win.__MESH_E2E_DB?.local_products?.find?.(p=>String(p.id)===String(id));code=productCode(cached)}
    const el=win.document.getElementById('productBarcode');if(el&&code)el.value=code;
  }
  function scheduleBarcodeHydrate(win,id){[0,120,450,900].forEach(ms=>setTimeout(()=>hydrateBarcode(win,id).catch(e=>console.warn('V22 barcode hydrate failed',e)),ms))}

  async function resolveProductId(win,{id,name,storeId}){if(id)return id;if(!name||!storeId)return'';const rows=await rest(win,`local_products?select=id&store_id=eq.${q(storeId)}&product_name=eq.${q(name)}&order=created_at.desc&limit=1`);return String((Array.isArray(rows)?rows[0]:null)?.id||'').trim()}
  async function persistCanonicalBarcode(win,{id,name,barcode}){const sid=String(store(win)?.id||'').trim(),code=String(barcode||'').trim();if(!sid||!code)return;const productId=await resolveProductId(win,{id,name,storeId:sid});if(!productId)return;await rest(win,`local_products?id=eq.${q(productId)}&store_id=eq.${q(sid)}`,{method:'PATCH',body:{barcode:code}});win.__mwBarcodeProductsCacheAt=0;setTimeout(()=>decorateBarcodes(win).catch(()=>{}),120)}
  function bindBarcodeSaveGuard(win){if(win.__mwV22BarcodeSaveGuard)return;win.document.addEventListener('click',e=>{const btn=e.target?.closest?.('button');if(!btn)return;const onclick=String(btn.getAttribute('onclick')||''),text=String(btn.textContent||'');if(!onclick.includes('saveProduct')&&!text.includes('حفظ المنتج'))return;const id=String(win.document.getElementById('productId')?.value||'').trim(),name=String(win.document.getElementById('productName')?.value||'').trim(),barcode=String(win.document.getElementById('productBarcode')?.value||'').trim();if(!barcode)return;const persist=()=>persistCanonicalBarcode(win,{id,name,barcode}).catch(err=>console.warn('V22 barcode save guard failed',err));if(id)persist();else[180,500,1100].forEach(ms=>setTimeout(persist,ms))},true);win.__mwV22BarcodeSaveGuard=true}

  async function findByCode(win,value){
    const sid=String(store(win)?.id||'').trim();if(!sid)return null;
    let rows=await rest(win,`local_products?select=id,product_name,barcode,stock_quantity&store_id=eq.${q(sid)}&barcode=eq.${q(value)}&limit=1`)||[];if(rows[0])return rows[0];
    try{rows=await rest(win,`local_products?select=id,product_name,barcode,sku,stock_quantity&store_id=eq.${q(sid)}&sku=eq.${q(value)}&limit=1`)||[];if(rows[0])return rows[0]}catch{}
    const cached=win.__MESH_E2E_DB?.local_products?.find?.(p=>String(p.store_id)===sid&&productCode(p)===value);return cached||null;
  }
  async function handleSmartSearch(win,e){
    if(e.key!=='Enter')return;const input=e.currentTarget,value=String(input.value||'').trim();if(!value)return;e.preventDefault();e.stopImmediatePropagation();
    try{const sid=String(store(win)?.id||'').trim();if(!sid)throw new Error('تعذر تحديد المتجر الحالي.');const exact=await findByCode(win,value);if(exact){input.value='';win.editProduct?.(exact.id);scheduleBarcodeHydrate(win,exact.id);return}const byName=await rest(win,`local_products?select=id,product_name,barcode,stock_quantity&store_id=eq.${q(sid)}&product_name=ilike.${q('%'+value+'%')}&limit=5`)||[];if(byName.length===1){input.value='';win.editProduct?.(byName[0].id);scheduleBarcodeHydrate(win,byName[0].id);return}if(/^[A-Za-z0-9._-]{4,80}$/.test(value)){input.value='';win.openProductModal?.();setTimeout(()=>{const el=win.document.getElementById('productBarcode');if(el){el.value=value;el.focus()}},0);return}const hint=win.document.getElementById('vendorSmartProductSearchHint');if(hint)hint.textContent=byName.length?'نتائج متعددة معروضة في الجدول.':'لا يوجد منتج مطابق بهذا الاسم.'}catch(err){console.error('V22 barcode search failed',err);win.alert?.('تعذر تنفيذ البحث: '+(err?.message||err))}
  }
  function bindSearch(win){const input=win.document.getElementById('vendorSmartProductSearch');if(!input||input.__mwV22Search)return;input.addEventListener('keydown',e=>handleSmartSearch(win,e),true);input.__mwV22Search=true}
  function bindEditCapture(win){if(win.__mwV22EditCapture)return;win.document.addEventListener('click',e=>{const btn=e.target?.closest?.('button[onclick*="editProduct("]');if(!btn)return;const code=String(btn.getAttribute('onclick')||''),id=code.match(/editProduct\(['"]([^'"]+)['"]\)/)?.[1]||'';if(id)scheduleBarcodeHydrate(win,id)},true);win.__mwV22EditCapture=true}

  function autoPrice(win,{force=false}={}){const costEl=win.document.getElementById('mwProductCostPrice'),baseEl=win.document.getElementById('productBasePrice'),marginEl=win.document.getElementById('mwGlobalProfitMargin');if(!costEl||!baseEl||!marginEl)return;const raw=String(costEl.value||'').trim(),marginRaw=String(marginEl.value||'').trim();if(raw===''||marginRaw==='')return;const cost=Number(raw),margin=Number(marginRaw);if(!Number.isFinite(cost)||cost<0||!Number.isFinite(margin)||margin<0)return;if(win.__mwV22ManualBase&&!force)return;const price=Math.ceil(cost*(1+margin/100));win.__mwV22InternalPrice=true;baseEl.value=String(price);baseEl.dispatchEvent(new win.Event('input',{bubbles:true}));win.__mwV22InternalPrice=false;const hint=win.document.getElementById('mwAutoPriceHint');if(hint)hint.textContent=`سعر البيع المقترح: ${price} (تكلفة ${cost} + ربح ${margin}%)`}
  function bindProductPricing(win){const d=win.document,cost=d.getElementById('mwProductCostPrice'),base=d.getElementById('productBasePrice');if(!cost||!base)return;if(!d.getElementById('mwAutoPriceHint')){const h=d.createElement('div');h.id='mwAutoPriceHint';h.className='text-[11px] font-bold text-emerald-300';cost.insertAdjacentElement('afterend',h)}if(!cost.__mwV22Cost){cost.addEventListener('input',()=>{win.__mwV22ManualBase=false;autoPrice(win)});cost.__mwV22Cost=true}if(!base.__mwV22Base){base.addEventListener('input',()=>{if(!win.__mwV22InternalPrice)win.__mwV22ManualBase=true});base.__mwV22Base=true}}
  async function loadMargin(win){const st=store(win),el=win.document.getElementById('mwGlobalProfitMargin');if(!st?.id||!el)return;if(st.profit_margin_percent!=null&&el.value==='')el.value=String(st.profit_margin_percent);try{const value=await rpc(win,'vendor_get_profit_margin',{p_store_id:String(st.id)}),candidate=Array.isArray(value)?value[0]:value,margin=typeof candidate==='number'?candidate:(typeof candidate==='string'&&candidate.trim()!==''?Number(candidate):NaN);if(Number.isFinite(margin)){el.value=String(margin);st.profit_margin_percent=margin;saveStore(win,st)}}catch(e){console.warn('V22 profit margin hydrate failed',e)}}
  async function saveMargin(win){const st=store(win),el=win.document.getElementById('mwGlobalProfitMargin');if(!st?.id||!el)return;const margin=Number(el.value);if(!Number.isFinite(margin)||margin<0||margin>10000){win.alert?.('أدخل نسبة ربح صحيحة بين 0 و10000.');return}try{await rpc(win,'vendor_set_profit_margin',{p_store_id:String(st.id),p_margin:margin});st.profit_margin_percent=margin;saveStore(win,st);win.showNotice?.('تم حفظ نسبة الربح العامة.');autoPrice(win,{force:!win.__mwV22ManualBase})}catch(e){console.error('V22 margin save failed',e);win.showNotice?.('تعذر حفظ نسبة الربح: '+(e?.message||e),true)}}
  function injectMarginUi(win){const d=win.document;if(d.getElementById('mwGlobalProfitMargin'))return;const heading=[...d.querySelectorAll('h1,h2,h3')].find(x=>String(x.textContent||'').includes('سعر الصرف المركزي')),card=heading?.closest('.glass'),grid=card?.querySelector('.grid');if(!grid)return;const wrap=d.createElement('div');wrap.className='col-span-2 grid grid-cols-[1fr_auto] gap-2';wrap.innerHTML='<input id="mwGlobalProfitMargin" class="field" type="number" min="0" max="10000" step="0.01" placeholder="نسبة الربح العامة %"><button id="mwSaveProfitMargin" type="button" class="rounded-2xl border border-amber-400/40 bg-amber-500/15 px-4 font-black text-amber-200 transition hover:bg-amber-500/25">حفظ نسبة الربح</button>';grid.appendChild(wrap);d.getElementById('mwSaveProfitMargin')?.addEventListener('click',()=>saveMargin(win));d.getElementById('mwGlobalProfitMargin')?.addEventListener('input',()=>autoPrice(win,{force:!win.__mwV22ManualBase}));loadMargin(win)}
  function wrapProductFunctions(win){const edit=win.editProduct;if(typeof edit==='function'&&!edit.__mwV22){const wrapped=function(id){win.__mwV22ManualBase=false;const r=edit.apply(this,arguments);scheduleBarcodeHydrate(win,id);return r};wrapped.__mwV22=true;wrapped.__mwBarcode=edit.__mwBarcode;wrapped.__mwTaxonomyV10=edit.__mwTaxonomyV10;wrapped.__mwFinanceV21=edit.__mwFinanceV21;win.editProduct=wrapped}const open=win.openProductModal;if(typeof open==='function'&&!open.__mwV22){const wrapped=function(){win.__mwV22ManualBase=false;const r=open.apply(this,arguments);setTimeout(()=>{bindProductPricing(win);autoPrice(win)},0);return r};wrapped.__mwV22=true;wrapped.__mwBarcode=open.__mwBarcode;wrapped.__mwTaxonomyV10=open.__mwTaxonomyV10;wrapped.__mwFinanceV21=open.__mwFinanceV21;win.openProductModal=wrapped}const load=win.loadProducts;if(typeof load==='function'&&!load.__mwV22){const wrapped=async function(){const r=await load.apply(this,arguments);setTimeout(()=>decorateBarcodes(win).catch(()=>{}),180);return r};wrapped.__mwV22=true;wrapped.__mwBarcode=load.__mwBarcode;win.loadProducts=wrapped}}
  function boot(win){injectMarginUi(win);bindSearch(win);bindEditCapture(win);bindBarcodeSaveGuard(win);bindProductPricing(win);wrapProductFunctions(win);decorateBarcodes(win).catch(()=>{});if(!win.__mwV22Observer){const ob=new win.MutationObserver(()=>{injectMarginUi(win);bindSearch(win);bindProductPricing(win);wrapProductFunctions(win)});ob.observe(win.document.documentElement,{childList:true,subtree:true});win.__mwV22Observer=ob}win.__mwVendorBarcodeMarginV22=true}
  function install(win){if(!win)return;if(win.document.readyState==='loading')win.document.addEventListener('DOMContentLoaded',()=>boot(win),{once:true});else boot(win)}
  window.MeshwarVendorBarcodeMarginV22={install,autoPrice,decorateBarcodes,hydrateBarcode,persistCanonicalBarcode,VERSION};
})();
