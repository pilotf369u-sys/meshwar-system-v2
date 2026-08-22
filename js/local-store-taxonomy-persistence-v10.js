/* MESHWAR_LOCAL_STORE_TAXONOMY_PERSISTENCE_V10 */
(function(){
  const SB_URL='https://hsmmbloouskqdnptiiad.supabase.co';
  const SB_KEY='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
  const STORE_KEY='meshwar_vendor_store';
  const q=v=>encodeURIComponent(String(v??''));
  const vendorPage=/vendor-dashboard(?:-v2)?\.html$/i.test(location.pathname)||!!document.getElementById('productModal');

  function sessionStore(){try{return JSON.parse(sessionStorage.getItem(STORE_KEY)||'null')}catch{return null}}
  async function rest(path,{method='GET',body=null,prefer='return=representation'}={}){
    const r=await fetch(`${SB_URL}/rest/v1/${path}`,{
      method,cache:'no-store',
      headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`,'Content-Type':'application/json',Accept:'application/json',...(method!=='GET'?{Prefer:prefer}:{})},
      body:body==null?null:JSON.stringify(body)
    });
    const text=await r.text();
    if(!r.ok)throw new Error(text||`HTTP ${r.status}`);
    return text?JSON.parse(text):null;
  }

  function taxonomySnapshot(){
    const main=String(document.getElementById('mwProductMainCategory')?.value||'').trim();
    const sub=String(document.getElementById('mwProductSubCategory')?.value||'').trim();
    return {main,sub,effective:sub||main||null};
  }

  async function resolveSavedProductId({id,name,storeId}){
    if(id)return id;
    if(!name||!storeId)return '';
    const rows=await rest(`local_products?select=id&store_id=eq.${q(storeId)}&product_name=eq.${q(name)}&order=created_at.desc&limit=1`);
    return String((Array.isArray(rows)?rows[0]:null)?.id||'').trim();
  }

  async function persistTaxonomy({id,name,storeId,taxonomy}){
    const productId=await resolveSavedProductId({id,name,storeId});
    if(!productId)throw new Error('تعذر تحديد المنتج المحفوظ لتثبيت التصنيف.');
    const payload={category_id:taxonomy.effective,subcategory_id:taxonomy.sub||null,updated_at:new Date().toISOString()};
    let saved;
    try{
      saved=await rest(`local_products?id=eq.${q(productId)}&store_id=eq.${q(storeId)}`,{method:'PATCH',body:payload,prefer:'return=representation'});
    }catch(err){
      if(/subcategory_id/i.test(String(err?.message||err))){
        throw new Error('حقل subcategory_id غير مطبق في Supabase بعد. شغّل migration 20260822_local_product_subcategory_persistence.sql ثم أعد المحاولة.');
      }
      throw err;
    }
    const row=Array.isArray(saved)?saved[0]:saved;
    if(!row)throw new Error('لم يرجع Supabase المنتج بعد حفظ التصنيف.');
    const verify=await rest(`local_products?select=id,category_id,subcategory_id&id=eq.${q(productId)}&store_id=eq.${q(storeId)}&limit=1`);
    const actual=Array.isArray(verify)?verify[0]:null;
    if(!actual)throw new Error('تعذر التحقق من التصنيف المحفوظ.');
    const expectedCategory=String(taxonomy.effective||'');
    const expectedSub=String(taxonomy.sub||'');
    if(String(actual.category_id||'')!==expectedCategory||String(actual.subcategory_id||'')!==expectedSub){
      throw new Error('فشل التحقق من category_id / subcategory_id بعد الحفظ.');
    }
    return actual;
  }

  function wrapSaveProduct(){
    const original=window.saveProduct;
    if(typeof original!=='function'||original.__mwTaxonomyV10)return false;
    const wrapped=async function(){
      const store=sessionStore();
      const id=String(document.getElementById('productId')?.value||'').trim();
      const name=String(document.getElementById('productName')?.value||'').trim();
      const taxonomy=taxonomySnapshot();
      await original.apply(this,arguments);
      if(!store?.id)return;
      try{
        await persistTaxonomy({id,name,storeId:String(store.id),taxonomy});
      }catch(err){
        console.error('V10 taxonomy persistence error',err);
        const message='تم حفظ بيانات المنتج الأساسية، لكن تعذر تثبيت التصنيف: '+(err?.message||err);
        if(typeof window.showNotice==='function')window.showNotice(message,true);
        alert(message);
      }
    };
    wrapped.__mwTaxonomyV10=true;
    window.saveProduct=wrapped;
    return true;
  }

  async function hydrateTaxonomyForEdit(productId){
    const store=sessionStore();if(!store?.id||!productId)return;
    try{
      const rows=await rest(`local_products?select=id,category_id,subcategory_id&id=eq.${q(productId)}&store_id=eq.${q(store.id)}&limit=1`);
      const p=Array.isArray(rows)?rows[0]:null;if(!p)return;
      const subId=String(p.subcategory_id||'').trim();
      const effective=String(p.category_id||'').trim();
      let mainId=effective;
      if(subId){
        const cats=await rest(`store_categories?select=id,parent_id&id=eq.${q(subId)}&store_id=eq.${q(store.id)}&limit=1`);
        const sub=Array.isArray(cats)?cats[0]:null;
        mainId=String(sub?.parent_id||effective||'').trim();
      }else if(effective){
        const cats=await rest(`store_categories?select=id,parent_id&id=eq.${q(effective)}&store_id=eq.${q(store.id)}&limit=1`);
        const cat=Array.isArray(cats)?cats[0]:null;
        if(cat?.parent_id){mainId=String(cat.parent_id);}
      }
      const main=document.getElementById('mwProductMainCategory');
      const sub=document.getElementById('mwProductSubCategory');
      if(main){main.value=mainId||'';main.dispatchEvent(new Event('change',{bubbles:true}))}
      setTimeout(()=>{if(sub)sub.value=subId||(effective&&effective!==mainId?effective:'')},0);
    }catch(err){console.warn('V10 taxonomy edit hydration failed',err)}
  }

  function wrapEditProduct(){
    const original=window.editProduct;
    if(typeof original!=='function'||original.__mwTaxonomyV10)return false;
    const wrapped=function(id){const result=original.apply(this,arguments);setTimeout(()=>hydrateTaxonomyForEdit(id),0);return result};
    wrapped.__mwTaxonomyV10=true;window.editProduct=wrapped;return true;
  }

  function startVendor(){
    let attempts=0;
    const timer=setInterval(()=>{
      attempts++;
      wrapSaveProduct();
      wrapEditProduct();
      if(attempts>=120)clearInterval(timer);
    },50);
  }

  if(vendorPage)startVendor();
  window.MeshwarTaxonomyPersistenceV10={persistTaxonomy,hydrateTaxonomyForEdit};
})();
