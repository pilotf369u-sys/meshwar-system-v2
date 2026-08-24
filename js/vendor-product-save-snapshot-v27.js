/* MESHWAR_VENDOR_PRODUCT_SAVE_SNAPSHOT_V27 */
(function(){
  'use strict';
  const VERSION='20260824-v27-snapshotbridge1';
  const SB_URL='https://hsmmbloouskqdnptiiad.supabase.co';
  const SB_KEY='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
  const STORE_KEY='meshwar_vendor_store';
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const q=v=>encodeURIComponent(String(v??''));
  let pending=null;

  function parseOptions(v){
    if(!v)return{};
    if(typeof v==='object'&&!Array.isArray(v))return{...v};
    try{const x=JSON.parse(v);return x&&typeof x==='object'&&!Array.isArray(x)?{...x}:{}}catch{return{}}
  }
  function store(win){try{return JSON.parse(win.sessionStorage.getItem(STORE_KEY)||'null')}catch{return null}}
  async function rest(path,{method='GET',body=null,prefer='return=representation'}={}){
    const r=await window.fetch(`${SB_URL}/rest/v1/${path}`,{
      method,cache:'no-store',
      headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`,'Content-Type':'application/json',Accept:'application/json',...(method!=='GET'?{Prefer:prefer}:{})},
      body:body==null?null:JSON.stringify(body)
    });
    const text=await r.text();if(!r.ok)throw new Error(text||`HTTP ${r.status}`);return text?JSON.parse(text):null;
  }
  function taxonomySnapshot(win){
    const d=win.document,mainEl=d.getElementById('mwProductMainCategory'),subEl=d.getElementById('mwProductSubCategory');
    let api={};try{api=win.MeshwarTaxonomyPersistenceV10?.taxonomySnapshot?.()||{}}catch{}
    const main=String(api.main||mainEl?.value||'').trim();
    const sub=String(api.sub||subEl?.value||'').trim();
    return{present:Boolean(mainEl||subEl),main,sub,effective:sub||main||null};
  }
  function capture(win){
    const d=win.document,st=store(win),taxonomy=taxonomySnapshot(win);
    const detailedEl=d.getElementById('productDetailedDescription'),costEl=d.getElementById('mwProductCostPrice');
    const rawCost=String(costEl?.value||'').trim();
    return{
      id:String(d.getElementById('productId')?.value||'').trim(),
      name:String(d.getElementById('productName')?.value||'').trim(),
      storeId:String(st?.id||'').trim(),
      taxonomy,
      hasDetailed:Boolean(detailedEl),
      detailed:String(detailedEl?.value||'').trim(),
      hasCost:Boolean(costEl),
      cost:rawCost===''?null:Math.max(0,Number(rawCost)||0),
      at:Date.now()
    };
  }
  async function resolveId(s){
    if(s.id)return s.id;
    if(!s.storeId||!s.name)return'';
    const rows=await rest(`local_products?select=id&store_id=eq.${q(s.storeId)}&product_name=eq.${q(s.name)}&order=created_at.desc&limit=1`);
    return String((Array.isArray(rows)?rows[0]:null)?.id||'').trim();
  }
  async function persist(s){
    if(!s?.storeId||!s?.name)return;
    for(let i=0;i<80;i++){
      if(i)await sleep(i<20?50:125);
      const id=await resolveId(s).catch(()=> '');if(!id)continue;
      try{
        const rows=await rest(`local_products?select=id,options,category_id,subcategory_id,cost_price&id=eq.${q(id)}&store_id=eq.${q(s.storeId)}&limit=1`),row=Array.isArray(rows)?rows[0]:null;
        if(!row)continue;
        const payload={updated_at:new Date().toISOString()};
        if(s.taxonomy?.present){payload.category_id=s.taxonomy.effective||null;payload.subcategory_id=s.taxonomy.sub||null}
        if(s.hasCost)payload.cost_price=s.cost;
        if(s.hasDetailed){const options=parseOptions(row.options);options.detailed_description=s.detailed;payload.options=options}
        const saved=await rest(`local_products?id=eq.${q(id)}&store_id=eq.${q(s.storeId)}`,{method:'PATCH',body:payload,prefer:'return=representation'});
        const actual=Array.isArray(saved)?saved[0]:saved;if(!actual)continue;
        if(s.taxonomy?.present&&(String(actual.category_id||'')!==String(s.taxonomy.effective||'')||String(actual.subcategory_id||'')!==String(s.taxonomy.sub||'')))throw new Error('taxonomy verification failed');
        if(s.hasCost&&Number(actual.cost_price??0)!==Number(s.cost??0))throw new Error('cost verification failed');
        if(s.hasDetailed&&String(parseOptions(actual.options).detailed_description||'')!==s.detailed)throw new Error('description verification failed');
        window.__mwVendorProductSaveV27Last={id,payload,at:Date.now()};
        if(pending===s)pending=null;
        return actual;
      }catch(err){if(i===79)throw err}
    }
    throw new Error('تعذر تحديد المنتج المحفوظ لتثبيت لقطة التعديل.');
  }
  function resume(){if(!pending||Date.now()-pending.at>30000)return;persist(pending).catch(err=>console.error('V27 pending product snapshot persistence failed',err))}
  function install(win){
    if(!win||win.__mwVendorProductSaveSnapshotV27)return;
    const bind=()=>{
      const d=win.document;
      d.querySelectorAll('button[onclick*="saveProduct"],button[onclick*="closeProductModal"]').forEach(btn=>btn.type='button');
      d.addEventListener('click',e=>{
        const btn=e.target?.closest?.('button[onclick*="saveProduct"]');if(!btn)return;
        const s=capture(win);if(!s.storeId||!s.name)return;
        pending=s;window.__mwVendorProductSaveV27Pending=s;
        persist(s).catch(err=>console.error('V27 product snapshot persistence failed',err));
      },true);
      win.__mwVendorProductSaveSnapshotV27=true;
      resume();
    };
    if(win.document.readyState==='loading')win.document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
  }
  window.MeshwarVendorProductSaveSnapshotV27={install,persist,VERSION,getPending:()=>pending};
})();
