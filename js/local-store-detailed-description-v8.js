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
  function snapshotDetailedDescription(){
    ensureField();
    return{
      id:String(document.getElementById('productId')?.value||'').trim(),
      name:String(document.getElementById('productName')?.value||'').trim(),
      storeId:storeId(),
      detailed:String(document.getElementById(FIELD_ID)?.value||'').trim()
    };
  }
  async function resolveSavedProductId(snapshot){
    if(snapshot.id)return snapshot.id;
    if(!snapshot.name||!snapshot.storeId)return'';
    const rows=await rest(`local_products?select=id&store_id=eq.${encodeURIComponent(snapshot.storeId)}&product_name=eq.${encodeURIComponent(snapshot.name)}&order=created_at.desc&limit=1`);
    return String((Array.isArray(rows)?rows[0]:null)?.id||'').trim();
  }
  async function persistDetailedDescriptionSnapshot(snapshot){
    if(!snapshot?.storeId||!snapshot.name)return;
    for(let i=0;i<32;i++){
      await sleep(i?125:180);
      const modal=document.getElementById('productModal');
      if(modal&&!modal.classList.contains('hidden'))continue;
      const id=await resolveSavedProductId(snapshot).catch(()=> '');if(!id)continue;
      try{
        const rows=await rest(`local_products?select=id,options&id=eq.${encodeURIComponent(id)}&store_id=eq.${encodeURIComponent(snapshot.storeId)}&limit=1`),p=Array.isArray(rows)?rows[0]:null;if(!p)continue;
        const options=parse(p.options);options.detailed_description=snapshot.detailed;
        await rest(`local_products?id=eq.${encodeURIComponent(id)}&store_id=eq.${encodeURIComponent(snapshot.storeId)}`,{method:'PATCH',prefer:'return=minimal',body:{options,updated_at:new Date().toISOString()}});
        const verify=await rest(`local_products?select=id,options&id=eq.${encodeURIComponent(id)}&store_id=eq.${encodeURIComponent(snapshot.storeId)}&limit=1`),saved=Array.isArray(verify)?verify[0]:null;
        if(String(parse(saved?.options).detailed_description||'')!==snapshot.detailed)throw new Error('فشل التحقق من الوصف التفصيلي بعد الحفظ.');
        window.__mwDetailedDescriptionLast={id,detailed:snapshot.detailed,at:Date.now()};
        return;
      }catch(e){if(i===31)throw e}
    }
    throw new Error('تعذر تحديد المنتج بعد اكتمال الحفظ.');
  }
  async function persistDetailedDescription(){return persistDetailedDescriptionSnapshot(snapshotDetailedDescription())}
  async function applyModalDetailedDescription(productId){
    const pid=String(productId||'').trim();if(!pid)return;
    try{const rows=await rest(`local_products?select=id,description,options&id=eq.${encodeURIComponent(pid)}&limit=1`),p=Array.isArray(rows)?rows[0]:null;if(!p)return;const detailed=String(parse(p.options).detailed_description||'').trim();if(!detailed)return;for(let i=0;i<20;i++){const text=document.querySelector('#mwLocalProductDetailsModal .mw-detail-description-text');if(text){text.textContent=detailed;window.MeshwarLocalStoreV7?.enhanceModal?.(pid);return}await sleep(50)}}catch(e){console.warn('Detailed description modal load failed',e)}
  }
  function bindModalHydration(){
    const modal=document.getElementById('productModal');if(!modal||modal.__mwDetailedDescriptionObserver)return;
    let wasOpen=false;
    const sync=()=>{
      const open=!modal.classList.contains('hidden');
      if(open&&!wasOpen)setTimeout(()=>fillDetailedDescription().catch(e=>console.warn('Detailed description edit hydrate failed',e)),0);
      wasOpen=open;
    };
    new MutationObserver(sync).observe(modal,{attributes:true,attributeFilter:['class']});modal.__mwDetailedDescriptionObserver=true;sync();
  }
  function startVendor(){
    ensureField();bindModalHydration();new MutationObserver(()=>{ensureField();bindModalHydration()}).observe(document.documentElement,{childList:true,subtree:true});
    document.addEventListener('click',e=>{
      const add=e.target.closest?.('#addNewProductBtn,button[onclick="openProductModal()"]');if(add)setTimeout(()=>{ensureField();const a=document.getElementById(FIELD_ID);if(a)a.value=''},0);
      const save=e.target.closest?.('button[onclick*="saveProduct"]');if(save){const snapshot=snapshotDetailedDescription();persistDetailedDescriptionSnapshot(snapshot).catch(err=>{console.error('Detailed description save failed',err);alert('تم حفظ المنتج، لكن تعذر حفظ الوصف التفصيلي: '+(err?.message||err))})}
    },true)
  }
  document.addEventListener('click',e=>{const btn=e.target.closest?.('.local-v3-order[data-pid]');if(btn&&!btn.disabled)setTimeout(()=>applyModalDetailedDescription(btn.dataset.pid),0)},true);
  window.MeshwarDetailedDescriptionV8={ensureField,fillDetailedDescription,persistDetailedDescription,persistDetailedDescriptionSnapshot,applyModalDetailedDescription};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{if(document.getElementById('productModal'))startVendor()},{once:true});else if(document.getElementById('productModal'))startVendor();
})();
