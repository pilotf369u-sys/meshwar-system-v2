/* MESHWAR_VENDOR_EDIT_DIRECT_DOM_V32 */
(function(){
  'use strict';
  const VERSION='20260825-v33-stale-hydration-guard2';
  const SB_URL='https://hsmmbloouskqdnptiiad.supabase.co';
  const SB_KEY='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
  const STORE_KEY='meshwar_vendor_store';
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  function parseObject(value){
    if(!value)return{};
    if(typeof value==='object'&&!Array.isArray(value))return value;
    try{const x=JSON.parse(value);return x&&typeof x==='object'&&!Array.isArray(x)?x:{}}catch{return{}}
  }
  function list(value){
    if(Array.isArray(value))return value.map(x=>String(x??'').trim()).filter(Boolean);
    if(typeof value==='string')return value.split(',').map(x=>x.trim()).filter(Boolean);
    return[];
  }
  function firstList(...values){for(const value of values){const x=list(value);if(x.length)return x}return[]}
  function storeId(win){try{return String(JSON.parse(win.sessionStorage.getItem(STORE_KEY)||'null')?.id||'').trim()}catch{return''}}
  async function rest(win,path){
    const r=await win.fetch(`${SB_URL}/rest/v1/${path}`,{cache:'no-store',headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`,Accept:'application/json'}});
    if(!r.ok)throw new Error(await r.text()||`HTTP ${r.status}`);
    const text=await r.text();return text?JSON.parse(text):null;
  }
  async function fetchProduct(win,id){
    const sid=storeId(win);if(!sid||!id)return null;
    const rows=await rest(win,`local_products?select=*&id=eq.${encodeURIComponent(id)}&store_id=eq.${encodeURIComponent(sid)}&limit=1`);
    return Array.isArray(rows)?rows[0]||null:null;
  }
  async function fetchCategories(win){
    const sid=storeId(win);if(!sid)return[];
    const rows=await rest(win,`store_categories?select=id,parent_id,name,is_visible,sort_order&store_id=eq.${encodeURIComponent(sid)}&order=sort_order.asc,name.asc`);
    return Array.isArray(rows)?rows:[];
  }
  function setValue(d,id,value){
    const el=d.getElementById(id);if(!el)return false;
    el.value=value==null?'':String(value);return true;
  }
  function imageCandidates(product,options,dimensions,nested){
    const values=[product.image_url,product.image,product.images,product.image_urls,options.images,options.image_urls,options.gallery,dimensions.images,nested.images];
    const out=[];
    for(const value of values){
      if(Array.isArray(value)){for(const item of value){const s=String(item?.url??item??'').trim();if(s&&!out.includes(s))out.push(s)}}
      else{const s=String(value?.url??value??'').trim();if(s&&!out.includes(s))out.push(s)}
    }
    return out;
  }
  function hydrateImages(d,images){
    const primary=images[0]||'';
    const hidden=d.getElementById('productImage');if(hidden)hidden.value=primary;
    const preview=d.getElementById('productImagePreview');
    if(preview){
      if(primary){preview.src=primary;preview.classList.remove('hidden')}
      else{preview.removeAttribute('src');preview.classList.add('hidden')}
    }
    const gallery=d.getElementById('productImageGallery')||d.getElementById('productImagesPreview')||d.querySelector('[data-product-image-gallery]');
    if(gallery&&images.length){
      gallery.innerHTML=images.map(url=>`<img src="${String(url).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')}" alt="صورة المنتج" style="width:72px;height:72px;object-fit:cover;border-radius:12px">`).join('');
    }
    return Boolean(hidden||preview||gallery);
  }
  function resolveTaxonomy(product,categories){
    const categoryId=String(product.category_id||'').trim();
    const explicitSub=String(product.subcategory_id||'').trim();
    const byId=id=>categories.find(c=>String(c.id)===String(id))||null;
    if(explicitSub){
      const sub=byId(explicitSub);return{main:String(sub?.parent_id||categoryId||'').trim(),sub:explicitSub};
    }
    const effective=byId(categoryId);
    if(effective?.parent_id)return{main:String(effective.parent_id),sub:categoryId};
    return{main:categoryId,sub:''};
  }
  function hydrateTaxonomy(win,product,categories){
    const d=win.document;
    try{win.MeshwarStoreCategoriesV9?.refreshProductCategoryFields?.()}catch{}
    const main=d.getElementById('mwProductMainCategory'),sub=d.getElementById('mwProductSubCategory');
    if(!main||!sub)return false;
    const wanted=resolveTaxonomy(product,categories);
    if(wanted.main&&[...main.options].some(o=>String(o.value)===wanted.main))main.value=wanted.main;
    else main.value='';
    const children=categories.filter(c=>String(c.parent_id||'')===String(main.value||''));
    sub.innerHTML='<option value="">بدون قسم فرعي</option>'+children.map(c=>`<option value="${String(c.id).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')}">${String(c.name||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</option>`).join('');
    sub.disabled=!main.value||!children.length;
    sub.value=wanted.sub&&children.some(c=>String(c.id)===wanted.sub)?wanted.sub:'';
    const featured=d.getElementById('mwProductFeatured');if(featured)featured.checked=Boolean(product.is_featured);
    win.__mwTaxonomyTouchedV10=false;
    win.__mwTaxonomySelectionV10={main:String(main.value||''),sub:String(sub.value||'')};
    return true;
  }
  function applyVisibleFields(win,product,categories){
    const d=win.document,options=parseObject(product.options),dimensions=parseObject(product.dimensions),nested=parseObject(options.dimensions);
    const detailed=String(product.detailed_description??options.detailed_description??nested.detailed_description??'');
    const colors=firstList(options.colors,product.colors,dimensions.colors,nested.colors);
    const sizes=firstList(options.sizes,product.sizes,product.size,dimensions.sizes,dimensions.size,nested.sizes,nested.size);
    const volumes=firstList(options.volumes,product.volumes,product.volume,dimensions.volumes,dimensions.volume,nested.volumes,nested.volume);
    const images=imageCandidates(product,options,dimensions,nested);
    try{win.MeshwarDetailedDescriptionV8?.ensureField?.()}catch{}
    const okDetailed=setValue(d,'productDetailedDescription',detailed);
    const okColors=setValue(d,'productColors',colors.join(', '));
    const okSizes=setValue(d,'productSizes',sizes.join(', '));
    const okVolumes=setValue(d,'productVolumes',volumes.join(', '));
    const okImage=hydrateImages(d,images);
    const okTaxonomy=hydrateTaxonomy(win,product,categories);
    win.__mwVendorDirectDomV32Last={id:String(product.id||''),detailed:detailed.length,colors:colors.length,sizes:sizes.length,volumes:volumes.length,images:images.length,main:String(d.getElementById('mwProductMainCategory')?.value||''),sub:String(d.getElementById('mwProductSubCategory')?.value||''),at:Date.now()};
    return okDetailed&&okColors&&okSizes&&okVolumes&&okImage&&okTaxonomy;
  }
  async function hydrate(win,productId){
    const id=String(productId||'').trim();if(!id)return false;
    const [product,categories]=await Promise.all([fetchProduct(win,id),fetchCategories(win)]);if(!product)return false;
    let complete=false,matchedOnce=false;
    for(let attempt=0;attempt<18;attempt++){
      const d=win.document,modal=d.getElementById('productModal');
      const currentId=String(d.getElementById('productId')?.value||'').trim();
      const visible=Boolean(modal&&!modal.classList.contains('hidden'));
      if(visible&&currentId===id){
        matchedOnce=true;
        complete=applyVisibleFields(win,product,categories)||complete;
      }else if(matchedOnce){
        // The user closed this edit or opened a fresh Add modal. Never hydrate stale product data into it.
        return complete;
      }
      await sleep(attempt<6?60:120);
    }
    if(!complete)console.warn('Vendor V33 complete edit hydration could not resolve all visible fields',id);
    return complete;
  }
  function install(win){
    if(!win||win.__mwVendorDirectDomV33Bound)return;
    win.document.addEventListener('click',event=>{
      const btn=event.target?.closest?.('button[onclick^="editProduct("]');if(!btn)return;
      const code=String(btn.getAttribute('onclick')||'');const match=code.match(/editProduct\(['\"]([^'\"]+)['\"]\)/);const id=match?.[1];if(!id)return;
      setTimeout(()=>hydrate(win,id).catch(err=>console.error('Vendor V33 complete edit hydration failed',err)),0);
    },true);
    win.__mwVendorDirectDomV33Bound=true;
  }
  window.MeshwarVendorEditDirectDomV32={install,hydrate,VERSION};
})();
