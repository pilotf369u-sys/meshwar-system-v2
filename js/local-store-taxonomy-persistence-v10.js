/* MESHWAR_LOCAL_STORE_TAXONOMY_PERSISTENCE_V10 */
(function(){
  const SB_URL='https://hsmmbloouskqdnptiiad.supabase.co';
  const SB_KEY='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
  const STORE_KEY='meshwar_vendor_store';
  const q=v=>encodeURIComponent(String(v??''));
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const vendorPage=/vendor-dashboard(?:-v2)?\.html$/i.test(location.pathname)||!!document.getElementById('productModal');

  function sessionStore(){try{return JSON.parse(sessionStorage.getItem(STORE_KEY)||'null')}catch{return null}}
  async function rest(path,{method='GET',body=null,prefer='return=representation'}={}){
    const r=await fetch(`${SB_URL}/rest/v1/${path}`,{method,cache:'no-store',headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`,'Content-Type':'application/json',Accept:'application/json',...(method!=='GET'?{Prefer:prefer}:{})},body:body==null?null:JSON.stringify(body)});
    const text=await r.text();if(!r.ok)throw new Error(text||`HTTP ${r.status}`);return text?JSON.parse(text):null;
  }
  function domTaxonomy(){
    const main=String(document.getElementById('mwProductMainCategory')?.value||'').trim();
    const sub=String(document.getElementById('mwProductSubCategory')?.value||'').trim();
    return{main,sub,effective:sub||main||null};
  }
  function shadowTaxonomy(){
    const s=window.__mwTaxonomySelectionV10;if(!window.__mwTaxonomyTouchedV10||!s)return domTaxonomy();
    const main=String(s.main||'').trim(),sub=String(s.sub||'').trim();return{main,sub,effective:sub||main||null};
  }
  async function resolveSavedProductId({id,name,storeId}){
    if(id)return id;if(!name||!storeId)return'';
    const rows=await rest(`local_products?select=id&store_id=eq.${q(storeId)}&product_name=eq.${q(name)}&order=created_at.desc&limit=1`);
    return String((Array.isArray(rows)?rows[0]:null)?.id||'').trim();
  }
  async function persistTaxonomy({id,name,storeId,taxonomy}){
    const productId=await resolveSavedProductId({id,name,storeId});if(!productId)throw new Error('تعذر تحديد المنتج المحفوظ لتثبيت التصنيف.');
    const payload={category_id:taxonomy.effective,subcategory_id:taxonomy.sub||null,updated_at:new Date().toISOString()};
    let saved;
    try{saved=await rest(`local_products?id=eq.${q(productId)}&store_id=eq.${q(storeId)}`,{method:'PATCH',body:payload,prefer:'return=representation'})}
    catch(err){if(/subcategory_id/i.test(String(err?.message||err)))throw new Error('حقل subcategory_id غير مطبق في Supabase بعد. شغّل migration 20260822_local_product_subcategory_persistence.sql ثم أعد المحاولة.');throw err}
    const row=Array.isArray(saved)?saved[0]:saved;if(!row)throw new Error('لم يرجع Supabase المنتج بعد حفظ التصنيف.');
    const verify=await rest(`local_products?select=id,category_id,subcategory_id&id=eq.${q(productId)}&store_id=eq.${q(storeId)}&limit=1`),actual=Array.isArray(verify)?verify[0]:null;if(!actual)throw new Error('تعذر التحقق من التصنيف المحفوظ.');
    const expectedCategory=String(taxonomy.effective||''),expectedSub=String(taxonomy.sub||'');
    if(String(actual.category_id||'')!==expectedCategory||String(actual.subcategory_id||'')!==expectedSub)throw new Error('فشل التحقق من category_id / subcategory_id بعد الحفظ.');
    window.__mwTaxonomyV10Last={id:productId,category_id:actual.category_id,subcategory_id:actual.subcategory_id,at:Date.now()};return actual;
  }
  async function hydrateTaxonomyForEdit(productId){
    const store=sessionStore();if(!store?.id||!productId)return;
    try{
      const rows=await rest(`local_products?select=id,category_id,subcategory_id&id=eq.${q(productId)}&store_id=eq.${q(store.id)}&limit=1`),p=Array.isArray(rows)?rows[0]:null;if(!p)return;
      const subId=String(p.subcategory_id||'').trim(),effective=String(p.category_id||'').trim();let mainId=effective;
      if(subId){const cats=await rest(`store_categories?select=id,parent_id&id=eq.${q(subId)}&store_id=eq.${q(store.id)}&limit=1`),sub=Array.isArray(cats)?cats[0]:null;mainId=String(sub?.parent_id||effective||'').trim()}
      else if(effective){const cats=await rest(`store_categories?select=id,parent_id&id=eq.${q(effective)}&store_id=eq.${q(store.id)}&limit=1`),cat=Array.isArray(cats)?cats[0]:null;if(cat?.parent_id)mainId=String(cat.parent_id)}
      window.__mwTaxonomySelectionV10={main:mainId||'',sub:subId||(effective&&effective!==mainId?effective:'')};
    }catch(err){console.warn('V10 taxonomy edit hydration failed',err)}
  }
  function restoreShadowSelection(){
    if(!window.__mwTaxonomyTouchedV10)return;const s=window.__mwTaxonomySelectionV10;if(!s)return;
    const main=document.getElementById('mwProductMainCategory'),sub=document.getElementById('mwProductSubCategory');
    if(main&&s.main&&[...main.options].some(o=>o.value===s.main)&&main.value!==s.main)main.value=s.main;
    if(sub&&s.sub&&[...sub.options].some(o=>o.value===s.sub)&&sub.value!==s.sub)sub.value=s.sub;
  }
  function installSelectionStabilizer(){
    if(window.__mwTaxonomySelectionObserverV10)return;
    const boot=()=>{const wrap=document.getElementById('mwProductTaxonomy');if(!wrap)return false;const ob=new MutationObserver(()=>queueMicrotask(restoreShadowSelection));ob.observe(wrap,{childList:true,subtree:true});window.__mwTaxonomySelectionObserverV10=ob;return true};
    if(!boot()){let n=0;const t=setInterval(()=>{if(boot()||++n>=80)clearInterval(t)},50)}
  }
  async function persistAfterSuccessfulSave(snapshot){
    if(!snapshot?.storeId||!snapshot.name||snapshot.skip)return;
    let sawClosed=false;
    for(let i=0;i<32;i++){
      await sleep(i?125:180);
      const modal=document.getElementById('productModal');if(modal&&!modal.classList.contains('hidden'))continue;
      if(!sawClosed){sawClosed=true;await sleep(850)}
      try{await persistTaxonomy(snapshot);return}catch(err){if(i===31)throw err}
    }
  }
  function markSaveFunction(){if(typeof window.saveProduct==='function')window.saveProduct.__mwTaxonomyV10=true}
  function bindSaveGuard(){
    if(window.__mwTaxonomySaveGuardV10)return;
    document.addEventListener('change',e=>{
      if(e.target?.id==='mwProductMainCategory'){
        window.__mwTaxonomyTouchedV10=true;window.__mwTaxonomySelectionV10={main:String(e.target.value||'').trim(),sub:''};return;
      }
      if(e.target?.id==='mwProductSubCategory'){
        window.__mwTaxonomyTouchedV10=true;const old=window.__mwTaxonomySelectionV10||{};window.__mwTaxonomySelectionV10={main:String(document.getElementById('mwProductMainCategory')?.value||old.main||'').trim(),sub:String(e.target.value||'').trim()};
      }
    },true);
    document.addEventListener('click',e=>{
      if(e.target?.closest?.('#addNewProductBtn,button[onclick="openProductModal()"]')){window.__mwTaxonomyTouchedV10=true;window.__mwTaxonomySelectionV10={main:'',sub:''}}
      if(e.target?.closest?.('button[onclick^="editProduct("]')){window.__mwTaxonomyTouchedV10=false;window.__mwTaxonomySelectionV10=null}
      const save=e.target?.closest?.('button[onclick*="saveProduct"]');if(!save)return;
      const store=sessionStore(),id=String(document.getElementById('productId')?.value||'').trim(),name=String(document.getElementById('productName')?.value||'').trim(),taxonomy=shadowTaxonomy();
      const skip=Boolean(id&&!window.__mwTaxonomyTouchedV10&&!taxonomy.effective);
      persistAfterSuccessfulSave({id,name,storeId:String(store?.id||''),taxonomy,skip}).catch(err=>{console.error('V10 taxonomy persistence error',err);const message='تم حفظ بيانات المنتج الأساسية، لكن تعذر تثبيت التصنيف: '+(err?.message||err);if(typeof window.showNotice==='function')window.showNotice(message,true);alert(message)})
    },true);
    window.__mwTaxonomySaveGuardV10=true;
  }
  function startVendor(){
    bindSaveGuard();installSelectionStabilizer();markSaveFunction();let tries=0;const timer=setInterval(()=>{markSaveFunction();if(++tries>=120)clearInterval(timer)},50);
  }
  if(vendorPage)startVendor();
  window.MeshwarTaxonomyPersistenceV10={persistTaxonomy,hydrateTaxonomyForEdit,taxonomySnapshot:shadowTaxonomy};
})();
