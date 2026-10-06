/* MESHWAR_LOCAL_STORE_VARIANT_STOCK_V5 */
(function(){
  const SB_URL='https://hsmmbloouskqdnptiiad.supabase.co';
  const SB_KEY='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const parse=v=>{if(!v)return{};if(typeof v==='object'&&!Array.isArray(v))return v;try{const x=JSON.parse(v);return x&&typeof x==='object'&&!Array.isArray(x)?x:{}}catch{return{}}};
  const values=v=>{const a=Array.isArray(v)?v:[v];return[...new Set(a.flatMap(x=>String(x??'').split(/[\s,،]+/)).map(x=>x.trim()).filter(Boolean))]};
  const emptyStock=()=>({color:{},size:{},volume:{}});
  const cleanGroup=g=>{const out={};if(!g||typeof g!=='object'||Array.isArray(g))return out;for(const [k,v] of Object.entries(g)){const key=String(k||'').trim(),n=Number(v);if(key&&Number.isFinite(n)&&n>=0)out[key]=Math.floor(n)}return out};
  const normalizeStock=v=>{const x=parse(v);return{color:cleanGroup(x.color||x.colors),size:cleanGroup(x.size||x.sizes),volume:cleanGroup(x.volume||x.volumes)}};
  const qtyFor=(stock,key,value)=>{const g=stock?.[key];if(!g||!Object.prototype.hasOwnProperty.call(g,value))return null;const n=Number(g[value]);return Number.isFinite(n)&&n>=0?Math.floor(n):null};

  const style=document.createElement('style');
  style.textContent=`
    .mw-option-btn.mw-variant-disabled,.mw-option-btn:disabled.mw-variant-disabled{opacity:.38!important;cursor:not-allowed!important;text-decoration:line-through!important;filter:grayscale(.7)!important;background:rgba(148,163,184,.08)!important}
    .mw-variant-availability{margin-top:9px;padding:8px 10px;border-radius:10px;border:1px solid rgba(212,175,55,.22);background:rgba(212,175,55,.06);font-size:12px;font-weight:900;color:#9a7415}.dark .mw-variant-availability{color:#fbbf24}
    .mw-variant-stock-editor{margin-top:10px;padding:12px;border:1px solid rgba(212,175,55,.24);border-radius:14px;background:rgba(212,175,55,.05)}
    .mw-variant-stock-title{font-weight:900;color:#fbbf24;margin-bottom:6px}.mw-variant-stock-help{font-size:12px;color:#94a3b8;line-height:1.6}
    .mw-variant-stock-group{margin-top:11px}.mw-variant-stock-group-title{font-size:12px;font-weight:900;margin-bottom:6px}
    .mw-variant-stock-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}.mw-variant-stock-row{display:grid;grid-template-columns:minmax(0,1fr) 78px;gap:7px;align-items:center}.mw-variant-stock-name{font-size:12px;font-weight:800;overflow-wrap:anywhere}.mw-variant-stock-input{min-width:0!important;padding:.55rem .6rem!important;text-align:center}
  `;
  document.head.appendChild(style);

  async function rest(path,opts={}){
    const r=await fetch(`${SB_URL}/rest/v1/${path}`,{method:opts.method||'GET',cache:'no-store',headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`,'Content-Type':'application/json',Accept:'application/json'},body:opts.body==null?null:JSON.stringify(opts.body)});
    if(!r.ok)throw new Error(await r.text()||`HTTP ${r.status}`);if(r.status===204)return null;const t=await r.text();return t?JSON.parse(t):null;
  }

  function selectedVariant(modal){const out={color:'',size:'',volume:''};for(const key of Object.keys(out)){const active=modal.querySelector(`[data-group="${key}"] .mw-option-btn.active`);if(active)out[key]=String(active.dataset.value||'').trim()}return out}
  function variantMax(modal,stock,total){let max=Math.max(0,Math.floor(Number(total)||0));const selected=selectedVariant(modal);for(const key of ['color','size','volume']){if(!selected[key])continue;const q=qtyFor(stock,key,selected[key]);if(q!==null)max=Math.min(max,q)}return max}
  function syncModalLimit(modal,stock,total){const max=variantMax(modal,stock,total),value=modal.querySelector('[data-q-value]');if(value){const current=Math.max(1,Math.floor(Number(value.textContent)||1));value.textContent=String(max>0?Math.min(current,max):1)}let note=modal.querySelector('.mw-variant-availability');if(!note){note=document.createElement('div');note.className='mw-variant-availability';const qty=modal.querySelector('.mw-modal-qty');qty?.insertAdjacentElement('beforebegin',note)}if(note)note.textContent=max>0?`المتاح حسب الخيارات المحددة: ${max}`:'هذا الاختيار غير متوفر حاليًا';return max}

  async function enhanceModal(productId){
    const pid=String(productId||'').trim();if(!pid)return;
    const rows=await rest(`local_products?select=id,stock_quantity,options&id=eq.${encodeURIComponent(pid)}&limit=1`),p=Array.isArray(rows)?rows[0]:null;if(!p)return;
    const modal=document.getElementById('mwLocalProductDetailsModal');if(!modal)return;
    const opts=parse(p.options),stock=normalizeStock(opts.variant_stock),total=p.stock_quantity===null||p.stock_quantity===undefined||p.stock_quantity===''?99:Math.max(0,Math.floor(Number(p.stock_quantity)||0));
    for(const key of ['color','size','volume']){modal.querySelectorAll(`[data-group="${key}"] .mw-option-btn`).forEach(btn=>{const q=qtyFor(stock,key,String(btn.dataset.value||''));btn.classList.toggle('mw-variant-disabled',q===0);btn.disabled=q===0;if(q!==null){btn.dataset.variantStock=String(q);btn.title=q===0?'نفد مخزون هذا الخيار':`المتاح: ${q}`}})}
    const resync=()=>syncModalLimit(modal,stock,total);
    modal.querySelectorAll('.mw-option-btn,[data-q]').forEach(el=>el.addEventListener('click',()=>queueMicrotask(resync)));
    const confirm=modal.querySelector('.mw-modal-confirm');confirm?.addEventListener('click',e=>{const max=resync();if(max<=0){e.preventDefault();e.stopImmediatePropagation();alert('الخيار المحدد غير متوفر حاليًا.')}},true);
    resync();
  }

  function editorValues(){const out=emptyStock();document.querySelectorAll('#mwVariantStockEditor [data-vs-group][data-vs-value]').forEach(input=>{const raw=String(input.value??'').trim();if(raw==='')return;const n=Number(raw);if(Number.isFinite(n)&&n>=0)out[input.dataset.vsGroup][input.dataset.vsValue]=Math.floor(n)});return out}
  function optionInputValues(){return{color:values(document.getElementById('productColors')?.value||''),size:values(document.getElementById('productSizes')?.value||''),volume:values(document.getElementById('productVolumes')?.value||'')}}
  function renderEditor(seed){const box=document.getElementById('mwVariantStockEditor');if(!box)return;const prev=seed?normalizeStock(seed):editorValues(),groups=optionInputValues(),labels={color:'الألوان',size:'المقاسات',volume:'الأحجام'};box.innerHTML=`<div class="mw-variant-stock-title">مخزون الخيارات</div><div class="mw-variant-stock-help">اختياري: اترك الحقل فارغًا لاستخدام المخزون الإجمالي، أدخل 0 لتعطيل الخيار، أو أدخل كمية مستقلة.</div>${Object.entries(groups).map(([key,list])=>list.length?`<div class="mw-variant-stock-group"><div class="mw-variant-stock-group-title">${labels[key]}</div><div class="mw-variant-stock-grid">${list.map(v=>`<label class="mw-variant-stock-row"><span class="mw-variant-stock-name">${esc(v)}</span><input type="number" min="0" step="1" class="field mw-variant-stock-input" data-vs-group="${key}" data-vs-value="${esc(v)}" value="${Object.prototype.hasOwnProperty.call(prev[key],v)?prev[key][v]:''}" placeholder="—"></label>`).join('')}</div></div>`:'').join('')}`}
  function ensureEditor(){const anchor=document.getElementById('productVolumes');if(!anchor)return false;let box=document.getElementById('mwVariantStockEditor');if(!box){box=document.createElement('div');box.id='mwVariantStockEditor';box.className='mw-variant-stock-editor md:col-span-2';anchor.insertAdjacentElement('afterend',box);for(const id of ['productColors','productSizes','productVolumes'])document.getElementById(id)?.addEventListener('input',()=>renderEditor())}if(!box.innerHTML)renderEditor(emptyStock());return true}
  async function seedEditor(productId){if(!productId)return renderEditor(emptyStock());try{const rows=await rest(`local_products?select=options&id=eq.${encodeURIComponent(productId)}&limit=1`),p=Array.isArray(rows)?rows[0]:null,o=parse(p?.options);renderEditor(o.variant_stock)}catch(e){console.warn('Variant stock seed failed',e)}}

  function injectVariantIntoBody(body,variant){
    const patchOne=item=>{if(!item||typeof item!=='object')return item;const options=parse(item.options);item.options={...options,variant_stock:variant};return item};
    if(Array.isArray(body))return body.map(x=>patchOne({...x}));return patchOne({...body});
  }
  function wrapVendorSave(){if(typeof window.saveProduct!=='function'||window.saveProduct.__mwVariantWrapped)return false;const original=window.saveProduct;const wrapped=async function(...args){const variant=editorValues(),realFetch=window.fetch;window.fetch=async function(input,init={}){try{const url=typeof input==='string'?input:String(input?.url||''),method=String(init.method||'GET').toUpperCase();if(url.includes('/rest/v1/local_products')&&(method==='POST'||method==='PATCH')&&init.body){const parsed=JSON.parse(init.body);init={...init,body:JSON.stringify(injectVariantIntoBody(parsed,variant))}}}catch(e){console.warn('Variant stock request injection skipped',e)}return realFetch.call(this,input,init)};try{return await original.apply(this,args)}finally{window.fetch=realFetch}};wrapped.__mwVariantWrapped=true;wrapped.__mwMulti=original.__mwMulti;window.saveProduct=wrapped;return true}
  function startVendor(){ensureEditor();let tries=0;const timer=setInterval(()=>{tries++;ensureEditor();if(wrapVendorSave()||tries>100)clearInterval(timer)},100);document.addEventListener('click',e=>{const add=e.target.closest?.('button[onclick="openProductModal()"]');if(add)setTimeout(()=>renderEditor(emptyStock()),40);const edit=e.target.closest?.('button[onclick^="editProduct("]');if(edit)setTimeout(()=>seedEditor(document.getElementById('productId')?.value),120)},true);new MutationObserver(()=>ensureEditor()).observe(document.body,{childList:true,subtree:true})}

  function start(){if(document.getElementById('productModal')||/vendor-dashboard\.html$/i.test(location.pathname))startVendor()}
  window.MeshwarVariantStock={enhanceModal,normalizeStock};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
