/* MESHWAR_LOCAL_STORE_DETAILED_DESCRIPTION_V8 */
(function(){
  const SB_URL='https://hsmmbloouskqdnptiiad.supabase.co';
  const SB_KEY='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
  const FIELD_ID='productDetailedDescription';
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const parse=v=>{if(!v)return{};if(typeof v==='object'&&!Array.isArray(v))return{...v};try{const x=JSON.parse(v);return x&&typeof x==='object'&&!Array.isArray(x)?{...x}:{}}catch{return{}}};
  async function rest(path,opts={}){const r=await fetch(`${SB_URL}/rest/v1/${path}`,{method:opts.method||'GET',cache:'no-store',headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`,'Content-Type':'application/json',Accept:'application/json',...(opts.prefer?{Prefer:opts.prefer}:{})},body:opts.body==null?null:JSON.stringify(opts.body)});if(!r.ok)throw new Error(await r.text()||`HTTP ${r.status}`);if(r.status===204)return null;const t=await r.text();return t?JSON.parse(t):null}
  function storeId(){try{return String(JSON.parse(sessionStorage.getItem('meshwar_vendor_store')||'null')?.id||'').trim()}catch{return''}}
  function ensureField(){
    const short=document.getElementById('productDescription');if(!short||document.getElementById(FIELD_ID))return;
    short.placeholder='وصف مختصر للبطاقة - بحد أقصى 30 حرفًا';short.maxLength=30;
    const area=document.createElement('textarea');area.id=FIELD_ID;area.className=(short.className||'field')+' md:col-span-2';area.rows=5;area.placeholder='الوصف التفصيلي للمنتج (اختياري) — يظهر فقط داخل تفاصيل المنتج';area.setAttribute('aria-label','الوصف التفصيلي للمنتج');short.insertAdjacentElement('afterend',area);
  }
  async function fillDetailedDescription(){
    ensureField();const area=document.getElementById(FIELD_ID),id=String(document.getElementById('productId')?.value||'').trim();if(!area)return;
    area.value='';if(!id)return;
    try{const rows=await rest(`local_products?select=id,options&id=eq.${encodeURIComponent(id)}&limit=1`);const p=Array.isArray(rows)?rows[0]:null;area.value=String(parse(p?.options).detailed_description||'')}catch(e){console.warn('Detailed description load failed',e)}
  }
  async function persistDetailedDescription(){
    const area=document.getElementById(FIELD_ID);if(!area)return;const detailed=String(area.value||'').trim(),sid=storeId();if(!sid)return;
    let id=String(document.getElementById('productId')?.value||'').trim();const name=String(document.getElementById('productName')?.value||'').trim();
    try{
      if(!id&&name){for(let i=0;i<8&&!id;i++){await sleep(250);const rows=await rest(`local_products?select=id,options&store_id=eq.${encodeURIComponent(sid)}&product_name=eq.${encodeURIComponent(name)}&order=created_at.desc&limit=1`);id=String((Array.isArray(rows)?rows[0]:null)?.id||'').trim()}}
      if(!id)return;
      const rows=await rest(`local_products?select=id,options&id=eq.${encodeURIComponent(id)}&store_id=eq.${encodeURIComponent(sid)}&limit=1`),p=Array.isArray(rows)?rows[0]:null;if(!p)return;
      const options=parse(p.options);options.detailed_description=detailed;
      await rest(`local_products?id=eq.${encodeURIComponent(id)}&store_id=eq.${encodeURIComponent(sid)}`,{method:'PATCH',prefer:'return=minimal',body:{options,updated_at:new Date().toISOString()}});
    }catch(e){console.error('Detailed description save failed',e);alert('تم حفظ المنتج، لكن تعذر حفظ الوصف التفصيلي: '+(e?.message||e))}
  }
  async function applyModalDetailedDescription(productId){
    const pid=String(productId||'').trim();if(!pid)return;
    try{const rows=await rest(`local_products?select=id,description,options&id=eq.${encodeURIComponent(pid)}&limit=1`),p=Array.isArray(rows)?rows[0]:null;if(!p)return;const detailed=String(parse(p.options).detailed_description||'').trim();if(!detailed)return;for(let i=0;i<20;i++){const text=document.querySelector('#mwLocalProductDetailsModal .mw-detail-description-text');if(text){text.textContent=detailed;window.MeshwarLocalStoreV7?.enhanceModal?.(pid);return}await sleep(50)}}catch(e){console.warn('Detailed description modal load failed',e)}
  }
  function startVendor(){ensureField();new MutationObserver(ensureField).observe(document.documentElement,{childList:true,subtree:true});document.addEventListener('click',e=>{const edit=e.target.closest?.('button[onclick^="editProduct("]');if(edit)setTimeout(fillDetailedDescription,0);const add=e.target.closest?.('#addNewProductBtn,button[onclick="openProductModal()"]');if(add)setTimeout(()=>{ensureField();const a=document.getElementById(FIELD_ID);if(a)a.value=''},0);const save=e.target.closest?.('button[onclick="saveProduct()"]');if(save)setTimeout(persistDetailedDescription,350)},true)}
  document.addEventListener('click',e=>{const btn=e.target.closest?.('.local-v3-order[data-pid]');if(btn&&!btn.disabled)setTimeout(()=>applyModalDetailedDescription(btn.dataset.pid),0)},true);
  window.MeshwarDetailedDescriptionV8={ensureField,fillDetailedDescription,persistDetailedDescription,applyModalDetailedDescription};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{if(document.getElementById('productModal'))startVendor()},{once:true});else if(document.getElementById('productModal'))startVendor();
})();
