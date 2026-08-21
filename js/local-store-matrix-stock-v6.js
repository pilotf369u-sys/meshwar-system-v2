/* MESHWAR_LOCAL_STORE_MATRIX_STOCK_V6 */
(function(){
  const SB_URL='https://hsmmbloouskqdnptiiad.supabase.co';
  const SB_KEY='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const parse=v=>{if(!v)return{};if(typeof v==='object'&&!Array.isArray(v))return v;try{const x=JSON.parse(v);return x&&typeof x==='object'&&!Array.isArray(x)?x:{}}catch{return{}}};
  const values=v=>{const a=Array.isArray(v)?v:[v];return[...new Set(a.flatMap(x=>String(x??'').split(/[\s,،]+/)).map(x=>x.trim()).filter(Boolean))]};
  const DIMENSIONS=['color','size','volume'];
  const DEFAULT_LABELS={color:'اللون',size:'المقاس',volume:'الحجم'};
  const plural={color:'colors',size:'sizes',volume:'volumes'};
  const matrixKey=selection=>DIMENSIONS.map(k=>String(selection?.[k]||'').trim()).filter(Boolean).join('_');
  const cleanMatrix=v=>{const out={};const x=parse(v);for(const [k,val] of Object.entries(x)){const key=String(k||'').trim(),n=Number(val);if(key&&Number.isFinite(n)&&n>=0)out[key]=Math.floor(n)}return out};
  const cleanLabels=v=>{const x=parse(v),out={};for(const key of DIMENSIONS){const s=String(x[key]||'').trim();if(s)out[key]=s}return out};

  const style=document.createElement('style');
  style.textContent=`
    .mw-matrix-editor{margin-top:10px;padding:12px;border:1px solid rgba(212,175,55,.3);border-radius:14px;background:rgba(212,175,55,.07)}
    .mw-matrix-title{font-weight:900;color:#fbbf24;margin-bottom:6px}.mw-matrix-help{font-size:12px;color:#94a3b8;line-height:1.6;margin-bottom:10px}
    .mw-matrix-labels{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:10px 0}.mw-matrix-labels label{display:grid;gap:5px;font-size:11px;font-weight:900;color:#cbd5e1}.mw-matrix-label-input{min-width:0!important;padding:.55rem .65rem!important}
    .mw-matrix-tree{display:grid;gap:10px}.mw-matrix-color-group{border:1px solid rgba(212,175,55,.22);border-radius:13px;padding:10px;background:rgba(15,23,42,.18)}.mw-matrix-color-title{font-weight:900;color:#fbbf24;margin-bottom:8px;display:flex;align-items:center;gap:7px}.mw-matrix-color-title:before{content:'●';font-size:9px}
    .mw-matrix-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px}.mw-matrix-row{display:grid;grid-template-columns:minmax(0,1fr) 78px;gap:8px;align-items:center;padding:8px;border-radius:11px;border:1px solid rgba(148,163,184,.15);background:rgba(15,23,42,.15)}
    .mw-matrix-name{font-size:12px;font-weight:900;overflow-wrap:anywhere}.mw-matrix-input{min-width:0!important;padding:.55rem .6rem!important;text-align:center}
    .mw-option-btn.mw-matrix-disabled{opacity:.35!important;cursor:not-allowed!important;text-decoration:line-through!important;filter:grayscale(.8)!important;background:rgba(148,163,184,.08)!important}
    .mw-matrix-availability{margin-top:8px;padding:8px 10px;border-radius:10px;border:1px solid rgba(212,175,55,.28);background:rgba(212,175,55,.08);font-size:12px;font-weight:900;color:#9a7415}.dark .mw-matrix-availability{color:#fbbf24}
    body.mw-matrix-active #mwVariantStockEditor{display:none!important}
    @media(max-width:720px){.mw-matrix-labels{grid-template-columns:1fr}.mw-matrix-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  async function rest(path){const r=await fetch(`${SB_URL}/rest/v1/${path}`,{cache:'no-store',headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`,Accept:'application/json'}});if(!r.ok)throw new Error(await r.text()||`HTTP ${r.status}`);const t=await r.text();return t?JSON.parse(t):null}

  function optionLists(options){const o=parse(options);return{color:values(o.colors),size:values(o.sizes),volume:values(o.volumes)}}
  function activeDimensions(lists){return DIMENSIONS.filter(k=>lists[k]?.length)}
  function combinations(lists){const dims=activeDimensions(lists);if(dims.length<2)return[];let rows=[{}];for(const dim of dims){const next=[];for(const row of rows)for(const value of lists[dim])next.push({...row,[dim]:value});rows=next}return rows}
  function currentSelection(modal){const out={color:'',size:'',volume:''};for(const key of DIMENSIONS){const b=modal.querySelector(`[data-group="${key}"] .mw-option-btn.active`);if(b)out[key]=String(b.dataset.value||'').trim()}return out}
  function variantQty(stock,key,value){const g=stock?.[key]||stock?.[plural[key]];if(!g||typeof g!=='object'||!Object.prototype.hasOwnProperty.call(g,value))return null;const n=Number(g[value]);return Number.isFinite(n)&&n>=0?Math.floor(n):null}
  function variantLimit(selection,variantStock,total){let max=Math.max(0,Math.floor(Number(total)||0));for(const key of DIMENSIONS){if(!selection[key])continue;const q=variantQty(variantStock,key,selection[key]);if(q!==null)max=Math.min(max,q)}return max}
  function exactMatrixQty(selection,matrix,lists){const dims=activeDimensions(lists);if(dims.length<2||dims.some(k=>!selection[k]))return null;const key=matrixKey(selection);if(!Object.prototype.hasOwnProperty.call(matrix,key))return null;return Math.max(0,Math.floor(Number(matrix[key])||0))}
  function compatibleCombinations(selection,lists){return combinations(lists).filter(combo=>DIMENSIONS.every(k=>!selection[k]||!combo[k]||combo[k]===selection[k]))}
  function shouldDisableCandidate(key,value,selection,lists,matrix){const next={...selection,[key]:value};const compatible=compatibleCombinations(next,lists);if(!compatible.length)return false;let hasFallback=false,hasPositive=false;for(const combo of compatible){const mk=matrixKey(combo);if(!Object.prototype.hasOwnProperty.call(matrix,mk)){hasFallback=true;continue}if(Number(matrix[mk])>0)hasPositive=true}return !hasFallback&&!hasPositive}
  function effectiveLimit(selection,lists,matrix,variantStock,total){let max=variantLimit(selection,variantStock,total);const mq=exactMatrixQty(selection,matrix,lists);if(mq!==null)max=Math.min(max,mq);return max}
  function applyModalLabels(modal,labels){for(const key of DIMENSIONS){const group=modal.querySelector(`[data-group="${key}"]`);const label=group?.querySelector('.mw-option-label');if(label)label.textContent=labels[key]||DEFAULT_LABELS[key]}}

  async function enhanceModal(productId){
    const pid=String(productId||'').trim();if(!pid)return;
    const rows=await rest(`local_products?select=id,stock_quantity,options&id=eq.${encodeURIComponent(pid)}&limit=1`),p=Array.isArray(rows)?rows[0]:null;if(!p)return;
    const modal=document.getElementById('mwLocalProductDetailsModal');if(!modal)return;
    const options=parse(p.options),lists=optionLists(options),labels={...DEFAULT_LABELS,...cleanLabels(options.option_labels)},matrix=cleanMatrix(options.matrix_stock),variantStock=parse(options.variant_stock),total=p.stock_quantity===null||p.stock_quantity===undefined||p.stock_quantity===''?99:Math.max(0,Math.floor(Number(p.stock_quantity)||0));
    applyModalLabels(modal,labels);
    if(activeDimensions(lists).length<2)return;
    let note=modal.querySelector('.mw-matrix-availability');if(!note){note=document.createElement('div');note.className='mw-matrix-availability';modal.querySelector('.mw-modal-qty')?.insertAdjacentElement('beforebegin',note)}
    const refresh=()=>{
      let selection=currentSelection(modal);
      for(const key of DIMENSIONS){modal.querySelectorAll(`[data-group="${key}"] .mw-option-btn`).forEach(btn=>{const val=String(btn.dataset.value||''),matrixDisabled=shouldDisableCandidate(key,val,selection,lists,matrix),variantDisabled=btn.classList.contains('mw-variant-disabled');btn.classList.toggle('mw-matrix-disabled',matrixDisabled);btn.disabled=variantDisabled||matrixDisabled;if(matrixDisabled&&btn.classList.contains('active'))btn.classList.remove('active');if(matrixDisabled)btn.title='هذه التركيبة غير متوفرة حاليًا'})}
      selection=currentSelection(modal);
      const max=effectiveLimit(selection,lists,matrix,variantStock,total),value=modal.querySelector('[data-q-value]');if(value){const cur=Math.max(1,Math.floor(Number(value.textContent)||1));value.textContent=String(max>0?Math.min(cur,max):1)}
      if(note){const mq=exactMatrixQty(selection,matrix,lists);note.textContent=mq===null?'اختر بقية الخيارات لعرض مخزون التركيبة المحددة':(max>0?`المتاح لهذه التركيبة: ${max}`:'هذه التركيبة غير متوفرة حاليًا')}
      return max;
    };
    modal.querySelectorAll('.mw-option-btn,[data-q]').forEach(el=>el.addEventListener('click',()=>queueMicrotask(refresh)));
    modal.querySelector('.mw-modal-confirm')?.addEventListener('click',e=>{const selection=currentSelection(modal),dims=activeDimensions(lists);if(dims.some(k=>!selection[k]))return;const max=refresh();if(max<=0){e.preventDefault();e.stopImmediatePropagation();alert('التركيبة المحددة غير متوفرة حاليًا.')}},true);
    refresh();
  }

  function formLists(){return{color:values(document.getElementById('productColors')?.value||''),size:values(document.getElementById('productSizes')?.value||''),volume:values(document.getElementById('productVolumes')?.value||'')}}
  function editorMatrix(){const out={};document.querySelectorAll('#mwMatrixStockEditor [data-matrix-key]').forEach(input=>{const raw=String(input.value??'').trim();if(raw==='')return;const n=Number(raw);if(Number.isFinite(n)&&n>=0)out[input.dataset.matrixKey]=Math.floor(n)});return out}
  function editorLabels(){const out={};document.querySelectorAll('#mwMatrixStockEditor [data-option-label]').forEach(input=>{const val=String(input.value||'').trim();if(val)out[input.dataset.optionLabel]=val});return out}
  function derivedColorStock(matrix,lists){const out={};if(!lists.color?.length)return out;for(const color of lists.color){let sum=0,configured=false;for(const combo of combinations(lists)){if(combo.color!==color)continue;const key=matrixKey(combo);if(Object.prototype.hasOwnProperty.call(matrix,key)){sum+=Math.max(0,Math.floor(Number(matrix[key])||0));configured=true}}if(configured)out[color]=sum}return out}
  function treeHtml(rows,lists,prev,labels){const dims=activeDimensions(lists),primary=lists.color?.length?'color':dims[0],groups=new Map();for(const combo of rows){const g=combo[primary]||'خيارات';if(!groups.has(g))groups.set(g,[]);groups.get(g).push(combo)}return [...groups.entries()].map(([group,items])=>`<section class="mw-matrix-color-group"><div class="mw-matrix-color-title">${esc(labels[primary]||DEFAULT_LABELS[primary])}: ${esc(group)}</div><div class="mw-matrix-grid">${items.map(combo=>{const key=matrixKey(combo),rest=dims.filter(k=>k!==primary).map(k=>`${labels[k]||DEFAULT_LABELS[k]}: ${combo[k]}`).join(' + ');return `<label class="mw-matrix-row"><span class="mw-matrix-name">${esc(rest||group)}</span><input type="number" min="0" step="1" class="field mw-matrix-input" data-matrix-key="${esc(key)}" value="${Object.prototype.hasOwnProperty.call(prev,key)?prev[key]:''}" placeholder="—"></label>`}).join('')}</div></section>`).join('')}
  function renderEditor(seed,seedLabels){const box=document.getElementById('mwMatrixStockEditor');if(!box)return;const lists=formLists(),rows=combinations(lists),prev=seed?cleanMatrix(seed):editorMatrix(),labels={...DEFAULT_LABELS,...cleanLabels(seedLabels||editorLabels())};document.body.classList.toggle('mw-matrix-active',rows.length>0);const labelFields=`<div class="mw-matrix-labels">${DIMENSIONS.map(k=>`<label>${DEFAULT_LABELS[k]} — اسم العرض<input class="field mw-matrix-label-input" data-option-label="${k}" value="${esc(labels[k]||DEFAULT_LABELS[k])}" placeholder="${esc(DEFAULT_LABELS[k])}"></label>`).join('')}</div>`;if(rows.length===0){box.innerHTML=`<div class="mw-matrix-title">مخزون التركيبات</div>${labelFields}<div class="mw-matrix-help">أدخل خيارين على الأقل (مثل لون + مقاس) لإنشاء مصفوفة التركيبات.</div>`;return}box.innerHTML=`<div class="mw-matrix-title">مخزون التركيبات المترابطة</div><div class="mw-matrix-help">عند وجود Matrix تُخفى حقول المخزون المفردة لتجنب الازدواجية. المخزون الفردي للون يُشتق تلقائيًا من مجموع تركيباته.</div>${labelFields}<div class="mw-matrix-tree">${treeHtml(rows,lists,prev,labels)}</div>`}
  function ensureEditor(){const anchor=document.getElementById('mwVariantStockEditor')||document.getElementById('productVolumes');if(!anchor)return false;let box=document.getElementById('mwMatrixStockEditor');if(!box){box=document.createElement('div');box.id='mwMatrixStockEditor';box.className='mw-matrix-editor md:col-span-2';anchor.insertAdjacentElement('afterend',box);for(const id of ['productColors','productSizes','productVolumes'])document.getElementById(id)?.addEventListener('input',()=>renderEditor())}if(!box.innerHTML)renderEditor({},{});return true}
  async function seedEditor(productId){if(!productId)return renderEditor({},{});try{const rows=await rest(`local_products?select=options&id=eq.${encodeURIComponent(productId)}&limit=1`),p=Array.isArray(rows)?rows[0]:null,o=parse(p?.options);renderEditor(o.matrix_stock,o.option_labels)}catch(e){console.warn('Matrix stock seed failed',e)}}
  function injectMatrix(body,matrix,labels,lists){const colorStock=derivedColorStock(matrix,lists);const patch=item=>{if(!item||typeof item!=='object')return item;const options=parse(item.options),oldVariant=parse(options.variant_stock),variantStock={...oldVariant};if(Object.keys(colorStock).length)variantStock.color=colorStock;item.options={...options,matrix_stock:matrix,option_labels:labels,variant_stock:variantStock};return item};return Array.isArray(body)?body.map(x=>patch({...x})):patch({...body})}
  function wrapVendorSave(){if(typeof window.saveProduct!=='function'||window.saveProduct.__mwMatrixWrapped)return false;const original=window.saveProduct;const wrapped=async function(...args){const matrix=editorMatrix(),labels=editorLabels(),lists=formLists(),realFetch=window.fetch;window.fetch=async function(input,init={}){try{const url=typeof input==='string'?input:String(input?.url||''),method=String(init.method||'GET').toUpperCase();if(url.includes('/rest/v1/local_products')&&(method==='POST'||method==='PATCH')&&init.body){const parsed=JSON.parse(init.body);init={...init,body:JSON.stringify(injectMatrix(parsed,matrix,labels,lists))}}catch(e){console.warn('Matrix stock request injection skipped',e)}return realFetch.call(this,input,init)};try{return await original.apply(this,args)}finally{window.fetch=realFetch}};wrapped.__mwMatrixWrapped=true;wrapped.__mwVariantWrapped=original.__mwVariantWrapped;wrapped.__mwMulti=original.__mwMulti;window.saveProduct=wrapped;return true}
  function startVendor(){ensureEditor();let tries=0;const timer=setInterval(()=>{tries++;ensureEditor();if(wrapVendorSave()||tries>100)clearInterval(timer)},100);document.addEventListener('click',e=>{const add=e.target.closest?.('button[onclick="openProductModal()"]');if(add)setTimeout(()=>renderEditor({},{}),60);const edit=e.target.closest?.('button[onclick^="editProduct("]');if(edit)setTimeout(()=>seedEditor(document.getElementById('productId')?.value),160)},true);new MutationObserver(()=>ensureEditor()).observe(document.body,{childList:true,subtree:true})}

  function start(){if(document.getElementById('productModal')||/vendor-dashboard\.html$/i.test(location.pathname))startVendor()}
  window.MeshwarMatrixStock={enhanceModal,matrixKey,cleanMatrix};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
