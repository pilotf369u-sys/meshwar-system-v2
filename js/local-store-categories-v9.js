/* MESHWAR_LOCAL_STORE_CATEGORIES_V9 */
(function(){
  const SB_URL='https://hsmmbloouskqdnptiiad.supabase.co';
  const SB_KEY='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
  const STORE_KEY='meshwar_vendor_store';
  const state={categories:[],storeId:'',editingId:'',frontStoreId:'',frontProducts:new Map(),frontCategories:new Map(),frontObserver:null};

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const q=v=>encodeURIComponent(String(v??''));
  const parseSession=()=>{try{return JSON.parse(sessionStorage.getItem(STORE_KEY)||'null')}catch{return null}};
  const slugify=v=>String(v||'').trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-+|-+$/g,'').slice(0,80)||'category';

  async function rest(path,{method='GET',body=null,prefer='return=representation'}={}){
    const r=await fetch(`${SB_URL}/rest/v1/${path}`,{
      method,cache:'no-store',
      headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`,'Content-Type':'application/json',Accept:'application/json',...(method!=='GET'?{Prefer:prefer}:{})},
      body:body==null?null:JSON.stringify(body)
    });
    if(!r.ok)throw new Error(await r.text()||`HTTP ${r.status}`);
    if(r.status===204)return null;
    const t=await r.text();return t?JSON.parse(t):null;
  }

  function uniqueSlug(name,id=''){
    const base=slugify(name);
    const used=new Set(state.categories.filter(c=>String(c.id)!==String(id)).map(c=>String(c.slug||'')));
    if(!used.has(base))return base;
    let n=2;while(used.has(`${base}-${n}`))n++;return `${base}-${n}`;
  }

  function categoryById(id){return state.categories.find(c=>String(c.id)===String(id))||null}
  function roots(){return state.categories.filter(c=>c.parent_id==null).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)||String(a.name).localeCompare(String(b.name),'ar'))}
  function children(parentId){return state.categories.filter(c=>c.parent_id!=null&&String(c.parent_id)===String(parentId)).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)||String(a.name).localeCompare(String(b.name),'ar'))}
  function validRootParentId(value){
    const id=String(value||'').trim();if(!id)return null;
    const parent=categoryById(id);
    if(!parent||parent.parent_id!=null||String(parent.id)===String(state.editingId))return null;
    return String(parent.id);
  }

  function injectCss(){
    if(document.getElementById('mwCategoriesV9Css'))return;
    const s=document.createElement('style');s.id='mwCategoriesV9Css';s.textContent=`
      .mw-cat-shell{border:1px solid rgba(212,175,55,.22);border-radius:20px;padding:16px;background:rgba(255,255,255,.035)}
      .mw-cat-form{display:grid;grid-template-columns:2fr 1.4fr .8fr auto;gap:10px;align-items:end}
      .mw-cat-form label{display:grid;gap:6px;font-size:12px;font-weight:900;color:#cbd5e1}
      .mw-cat-form input,.mw-cat-form select{width:100%;border-radius:12px;border:1px solid rgba(255,255,255,.1);background:#0f172a;color:#f8fafc;padding:10px}
      .mw-cat-list{display:grid;gap:10px;margin-top:15px}.mw-cat-group{border:1px solid rgba(212,175,55,.16);border-radius:16px;overflow:hidden}
      .mw-cat-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 12px;background:rgba(255,255,255,.025)}
      .mw-cat-row.sub{padding-inline-start:34px;border-top:1px solid rgba(255,255,255,.06)}
      .mw-cat-name{font-weight:900}.mw-cat-meta{font-size:11px;color:#94a3b8;margin-top:3px}
      .mw-cat-actions{display:flex;gap:6px;flex-wrap:wrap}.mw-cat-actions button{border:0;border-radius:9px;padding:6px 9px;font-size:11px;font-weight:900;cursor:pointer}
      .mw-cat-edit{background:#0284c7;color:#fff}.mw-cat-toggle{background:#a16207;color:#fff}.mw-cat-move{background:#334155;color:#fff}.mw-cat-delete{background:#be123c;color:#fff}
      .mw-product-taxonomy{display:grid;grid-template-columns:1fr 1fr;gap:10px;grid-column:1/-1;padding:12px;border:1px solid rgba(212,175,55,.2);border-radius:14px;background:rgba(212,175,55,.05)}
      .mw-product-taxonomy label{display:grid;gap:6px;font-size:12px;font-weight:900}.mw-product-taxonomy .mw-featured{display:flex;align-items:center;gap:9px;grid-column:1/-1}
      .mw-category-bar{display:flex;gap:8px;overflow-x:auto;padding:8px 2px 12px;scrollbar-width:thin}.mw-category-bar button{flex:0 0 auto;border-radius:999px;border:1px solid rgba(212,175,55,.3);background:rgba(212,175,55,.08);color:inherit;padding:9px 14px;font-weight:900;cursor:pointer;white-space:nowrap}.mw-category-bar button.active{background:linear-gradient(135deg,#D4AF37,#FFDF73);color:#111827;border-color:#D4AF37}
      @media(max-width:720px){.mw-cat-form{grid-template-columns:1fr}.mw-product-taxonomy{grid-template-columns:1fr}}
    `;document.head.appendChild(s);
  }

  async function loadVendorCategories(){
    const store=parseSession();state.storeId=String(store?.id||'').trim();if(!state.storeId)return [];
    const rows=await rest(`store_categories?select=id,store_id,parent_id,name,slug,sort_order,is_visible&store_id=eq.${q(state.storeId)}&order=sort_order.asc,name.asc`);
    state.categories=Array.isArray(rows)?rows:[];return state.categories;
  }

  function categoryPanelHtml(){
    return `<section id="vendorTab-categories" class="vendor-tab-panel">
      <div class="glass rounded-3xl p-4 md:p-5">
        <div class="mb-3"><h2 class="vendor-text text-lg font-black">تصنيفات المتجر</h2><p class="vendor-muted mt-1 text-xs text-slate-400">أنشئ أقسامًا رئيسية وفرعية، ورتبها أو أخفها مؤقتًا. المنتجات بلا تصنيف تظهر تلقائيًا ضمن «عام».</p></div>
        <div class="mw-cat-shell">
          <div class="mw-cat-form">
            <label>اسم القسم<input id="mwCatName" type="text" maxlength="80" placeholder="مثال: دراجات"></label>
            <label>القسم الأب<select id="mwCatParent"><option value="">قسم رئيسي</option></select></label>
            <label>الترتيب<input id="mwCatSort" type="number" step="1" value="0"></label>
            <button id="mwCatSave" type="button" class="rounded-xl bg-emerald-600 px-4 py-2 font-black text-white">إضافة</button>
          </div>
          <div id="mwCatEditHint" class="mt-2 hidden text-xs text-amber-300"></div>
          <div id="mwCatList" class="mw-cat-list"></div>
        </div>
      </div>
    </section>`;
  }

  function renderVendorCategories(){
    const parent=document.getElementById('mwCatParent'),list=document.getElementById('mwCatList');
    if(parent){
      const current=parent.value;
      parent.innerHTML='<option value="">قسم رئيسي</option>'+roots().filter(c=>String(c.id)!==String(state.editingId)).map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
      if([...parent.options].some(o=>o.value===current))parent.value=current;
    }
    if(!list)return;
    list.innerHTML=roots().map(root=>{
      const sub=children(root.id).map(c=>categoryRow(c,true)).join('');
      return `<div class="mw-cat-group">${categoryRow(root,false)}${sub}</div>`;
    }).join('')||'<div class="vendor-muted p-3 text-center text-sm text-slate-400">لا توجد تصنيفات بعد.</div>';
  }

  function categoryRow(c,isSub){
    return `<div class="mw-cat-row ${isSub?'sub':''}" data-cat-id="${esc(c.id)}"><div><div class="mw-cat-name">${isSub?'↳ ':''}${esc(c.name)}</div><div class="mw-cat-meta">${c.is_visible?'ظاهر':'مخفي'} • ترتيب ${Number(c.sort_order||0)}</div></div><div class="mw-cat-actions"><button class="mw-cat-move" data-cat-act="up">↑</button><button class="mw-cat-move" data-cat-act="down">↓</button><button class="mw-cat-toggle" data-cat-act="toggle">${c.is_visible?'إخفاء':'إظهار'}</button><button class="mw-cat-edit" data-cat-act="edit">تعديل</button><button class="mw-cat-delete" data-cat-act="delete">حذف</button></div></div>`;
  }

  function resetCategoryForm(){
    state.editingId='';
    const n=document.getElementById('mwCatName'),p=document.getElementById('mwCatParent'),s=document.getElementById('mwCatSort'),b=document.getElementById('mwCatSave'),h=document.getElementById('mwCatEditHint');
    if(n)n.value='';if(p)p.value='';if(s)s.value='0';if(b)b.textContent='إضافة';if(h){h.classList.add('hidden');h.textContent=''}
    renderVendorCategories();
  }

  async function saveCategory(){
    const name=String(document.getElementById('mwCatName')?.value||'').trim();
    const selectedParent=String(document.getElementById('mwCatParent')?.value||'').trim();
    const parentId=validRootParentId(selectedParent);
    const sort=Math.floor(Number(document.getElementById('mwCatSort')?.value)||0);
    if(!name)return alert('أدخل اسم القسم.');
    if(selectedParent&&!parentId)return alert('القسم الأب المحدد غير صالح. اختر قسمًا رئيسيًا فقط.');
    const payload={store_id:state.storeId,parent_id:parentId,name,slug:uniqueSlug(name,state.editingId),sort_order:sort,is_visible:true,updated_at:new Date().toISOString()};
    let saved;
    if(state.editingId){
      delete payload.store_id;
      const old=categoryById(state.editingId);payload.is_visible=old?.is_visible!==false;
      saved=await rest(`store_categories?id=eq.${q(state.editingId)}&store_id=eq.${q(state.storeId)}`,{method:'PATCH',body:payload,prefer:'return=representation'});
    }else{
      saved=await rest('store_categories',{method:'POST',body:payload,prefer:'return=representation'});
    }
    const row=Array.isArray(saved)?saved[0]:saved;
    if(!row)throw new Error('لم يرجع Supabase القسم المحفوظ للتحقق من parent_id.');
    const actual=row.parent_id==null?null:String(row.parent_id);
    const expected=parentId==null?null:String(parentId);
    if(actual!==expected)throw new Error('تعذر تثبيت ربط القسم الأب (parent_id) في Supabase.');
    await loadVendorCategories();resetCategoryForm();refreshProductCategoryFields();
  }

  async function moveCategory(id,dir){
    const c=categoryById(id);if(!c)return;
    const siblings=state.categories.filter(x=>String(x.parent_id||'')===String(c.parent_id||'')).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)||String(a.name).localeCompare(String(b.name),'ar'));
    const i=siblings.findIndex(x=>String(x.id)===String(id)),j=i+(dir==='up'?-1:1);if(i<0||j<0||j>=siblings.length)return;
    const other=siblings[j],a=Number(c.sort_order||0),b=Number(other.sort_order||0);
    const ca=a===b?(dir==='up'?b-1:b+1):b,cb=a===b?b:a;
    await Promise.all([
      rest(`store_categories?id=eq.${q(c.id)}&store_id=eq.${q(state.storeId)}`,{method:'PATCH',body:{sort_order:ca},prefer:'return=minimal'}),
      rest(`store_categories?id=eq.${q(other.id)}&store_id=eq.${q(state.storeId)}`,{method:'PATCH',body:{sort_order:cb},prefer:'return=minimal'})
    ]);
    await loadVendorCategories();renderVendorCategories();
  }

  async function categoryAction(id,act){
    const c=categoryById(id);if(!c)return;
    if(act==='edit'){
      state.editingId=id;document.getElementById('mwCatName').value=c.name||'';document.getElementById('mwCatSort').value=String(c.sort_order||0);renderVendorCategories();document.getElementById('mwCatParent').value=c.parent_id||'';document.getElementById('mwCatSave').textContent='حفظ التعديل';
      const h=document.getElementById('mwCatEditHint');h.textContent='تعديل: '+c.name+' — اضغط «حفظ التعديل» أو أعد فتح التبويب للإلغاء.';h.classList.remove('hidden');return;
    }
    if(act==='toggle'){await rest(`store_categories?id=eq.${q(id)}&store_id=eq.${q(state.storeId)}`,{method:'PATCH',body:{is_visible:!c.is_visible},prefer:'return=minimal'});}
    if(act==='delete'){
      if(!confirm(`حذف القسم «${c.name}»؟ التصنيفات الفرعية التابعة له ستحذف، والمنتجات ستعود إلى «عام».`))return;
      await rest(`store_categories?id=eq.${q(id)}&store_id=eq.${q(state.storeId)}`,{method:'DELETE',prefer:'return=minimal'});
    }
    if(act==='up'||act==='down'){await moveCategory(id,act);return}
    await loadVendorCategories();renderVendorCategories();refreshProductCategoryFields();
  }

  function injectVendorTab(){
    const nav=document.querySelector('.vendor-main-tabs');if(!nav||document.getElementById('vendorTabBtn-categories'))return;
    nav.style.gridTemplateColumns='repeat(4,minmax(0,1fr))';
    const btn=document.createElement('button');btn.id='vendorTabBtn-categories';btn.type='button';btn.className='vendor-main-tab';btn.textContent='🗂️ التصنيفات';nav.appendChild(btn);
    const last=document.querySelector('.vendor-tab-panel:last-of-type');if(last)last.insertAdjacentHTML('afterend',categoryPanelHtml());else nav.insertAdjacentHTML('afterend',categoryPanelHtml());
    btn.addEventListener('click',()=>{document.querySelectorAll('.vendor-main-tab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.vendor-tab-panel').forEach(x=>x.classList.remove('active'));btn.classList.add('active');document.getElementById('vendorTab-categories')?.classList.add('active');});
    document.getElementById('mwCatSave')?.addEventListener('click',()=>saveCategory().catch(e=>alert('تعذر حفظ القسم: '+(e?.message||e))));
    document.getElementById('mwCatList')?.addEventListener('click',e=>{const b=e.target.closest?.('[data-cat-act]'),row=b?.closest?.('[data-cat-id]');if(!b||!row)return;categoryAction(row.dataset.catId,b.dataset.catAct).catch(err=>alert('تعذر تحديث القسم: '+(err?.message||err)))});
  }

  function injectProductFields(){
    const short=document.getElementById('productDescription');if(!short||document.getElementById('mwProductTaxonomy'))return;
    const wrap=document.createElement('div');wrap.id='mwProductTaxonomy';wrap.className='mw-product-taxonomy';
    wrap.innerHTML=`<label>القسم الرئيسي<select id="mwProductMainCategory" class="field"><option value="">عام</option></select></label><label>القسم الفرعي<select id="mwProductSubCategory" class="field" disabled><option value="">بدون قسم فرعي</option></select></label><label class="mw-featured"><input id="mwProductFeatured" type="checkbox"> <span>⭐ منتج مميز</span></label>`;
    const anchor=document.getElementById('productDetailedDescription')||short;anchor.insertAdjacentElement('afterend',wrap);
    document.getElementById('mwProductMainCategory').addEventListener('change',()=>fillSubcategorySelect(''));
    refreshProductCategoryFields();
  }

  function refreshProductCategoryFields(){
    injectProductFields();
    const main=document.getElementById('mwProductMainCategory');if(!main)return;
    const cur=main.value;
    main.innerHTML='<option value="">عام</option>'+roots().map(c=>`<option value="${esc(c.id)}">${esc(c.name)}${c.is_visible?'':' (مخفي)'}</option>`).join('');
    if([...main.options].some(o=>o.value===cur))main.value=cur;
    fillSubcategorySelect();
  }

  function fillSubcategorySelect(selected=''){
    const main=document.getElementById('mwProductMainCategory'),sub=document.getElementById('mwProductSubCategory');if(!main||!sub)return;
    const mainId=String(main.value||'').trim();
    const kids=mainId?children(mainId):[];
    sub.innerHTML='<option value="">بدون قسم فرعي</option>'+kids.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}${c.is_visible?'':' (مخفي)'}</option>`).join('');
    const wanted=String(selected||'').trim();
    sub.value=wanted&&kids.some(c=>String(c.id)===wanted)?wanted:'';
    sub.disabled=!mainId||!kids.length;
  }

  async function loadProductTaxonomy(productId){
    injectProductFields();refreshProductCategoryFields();const main=document.getElementById('mwProductMainCategory'),sub=document.getElementById('mwProductSubCategory'),featured=document.getElementById('mwProductFeatured');
    if(main)main.value='';if(sub){sub.innerHTML='<option value="">بدون قسم فرعي</option>';sub.disabled=true}if(featured)featured.checked=false;
    const id=String(productId||'').trim();if(!id)return;
    const rows=await rest(`local_products?select=id,category_id,is_featured&id=eq.${q(id)}&store_id=eq.${q(state.storeId)}&limit=1`),p=Array.isArray(rows)?rows[0]:null;if(!p)return;
    if(featured)featured.checked=!!p.is_featured;
    const cat=categoryById(p.category_id);if(!cat)return;
    if(cat.parent_id){if(main)main.value=cat.parent_id;fillSubcategorySelect(cat.id)}else{if(main)main.value=cat.id;fillSubcategorySelect()}
  }

  async function persistProductTaxonomy(snapshot){
    if(!snapshot||!state.storeId)return;
    const modal=document.getElementById('productModal');if(modal&&!modal.classList.contains('hidden'))return;
    let id=String(snapshot.id||'').trim();
    if(!id&&snapshot.name){
      const rows=await rest(`local_products?select=id&store_id=eq.${q(state.storeId)}&product_name=eq.${q(snapshot.name)}&order=created_at.desc&limit=1`);id=String((Array.isArray(rows)?rows[0]:null)?.id||'').trim();
    }
    if(!id)return;
    await rest(`local_products?id=eq.${q(id)}&store_id=eq.${q(state.storeId)}`,{method:'PATCH',body:{category_id:snapshot.categoryId||null,is_featured:!!snapshot.featured},prefer:'return=minimal'});
  }

  function bindProductTaxonomy(){
    document.addEventListener('click',e=>{
      const edit=e.target.closest?.('button[onclick^="editProduct("]');
      if(edit){const m=String(edit.getAttribute('onclick')||'').match(/editProduct\('([^']+)'\)/);if(m)setTimeout(()=>loadProductTaxonomy(m[1]).catch(console.warn),0)}
      const add=e.target.closest?.('#addNewProductBtn,button[onclick="openProductModal()"]');
      if(add)setTimeout(()=>loadProductTaxonomy('').catch(console.warn),0);
      const save=e.target.closest?.('button[onclick="saveProduct()"]');
      if(save){
        injectProductFields();
        const id=String(document.getElementById('productId')?.value||'').trim(),name=String(document.getElementById('productName')?.value||'').trim();
        const main=String(document.getElementById('mwProductMainCategory')?.value||'').trim(),sub=String(document.getElementById('mwProductSubCategory')?.value||'').trim();
        const snapshot={id,name,categoryId:sub||main||null,featured:!!document.getElementById('mwProductFeatured')?.checked};
        setTimeout(()=>persistProductTaxonomy(snapshot).catch(err=>alert('تم حفظ المنتج، لكن تعذر حفظ التصنيف: '+(err?.message||err))),650);
      }
    },true);
  }

  async function startVendor(){
    injectCss();injectVendorTab();injectProductFields();bindProductTaxonomy();
    await loadVendorCategories();renderVendorCategories();refreshProductCategoryFields();
    new MutationObserver(()=>{injectVendorTab();injectProductFields()}).observe(document.documentElement,{childList:true,subtree:true});
  }

  function cleanupLegacyCategoryBars(keep=null){
    const selectors=['#mwCategoryBar','.old-category-bar','[data-legacy-category-bar]','[data-mw-legacy-category-bar]'];
    selectors.forEach(sel=>document.querySelectorAll(sel).forEach(node=>{if(node!==keep)node.remove()}));
    document.querySelectorAll('#mwCategoryShell').forEach((node,index)=>{if(node!==keep||index>0)node.remove()});
  }

  function ensureProductsContainer(){
    const grid=document.getElementById('localStoreProductsGrid');if(!grid)return null;
    let container=document.getElementById('local-store-products-container');
    if(!container){
      container=document.createElement('div');container.id='local-store-products-container';
      grid.parentElement?.insertBefore(container,grid);container.appendChild(grid);
    }else if(!container.contains(grid))container.appendChild(grid);
    return container;
  }

  function injectStorefrontCss(){
    let s=document.getElementById('mwCategoryStickyPatchCss');
    if(!s){s=document.createElement('style');s.id='mwCategoryStickyPatchCss';document.head.appendChild(s)}
    s.textContent=`
      #localStoreProductsPanel,#local-store-products-container{overflow:visible!important;contain:none!important}
      #local-store-products-container{position:relative!important;width:100%;min-width:0}
      #localStoreProductsTitle{color:#0f172a!important;font-weight:800!important;font-size:1.25rem!important;line-height:1.35!important;opacity:1!important}
      html.dark #localStoreProductsTitle{color:#f8fafc!important}
      #mwCategoryShell{position:sticky!important;top:0!important;z-index:50!important;margin:0 0 14px;padding:10px;border:1px solid rgba(212,175,55,.28);border-radius:16px;background:rgba(11,19,43,.96);box-shadow:0 12px 30px rgba(2,6,23,.22);backdrop-filter:blur(14px);isolation:isolate}
      #mwCategoryShell .mw-category-bar,#mwCategoryShell .mw-subcategory-bar{display:flex;gap:8px;overflow-x:auto;scroll-behavior:smooth;scrollbar-width:thin;-webkit-overflow-scrolling:touch;padding:2px 1px}
      #mwCategoryShell .mw-subcategory-bar{margin-top:8px;padding-top:8px;border-top:1px solid rgba(212,175,55,.14)}
      #mwCategoryShell .mw-subcategory-bar:empty{display:none}
      #mwCategoryShell button{flex:0 0 auto;border-radius:999px;border:1px solid rgba(212,175,55,.34);background:rgba(255,255,255,.06);color:#f8fafc;padding:9px 14px;font-size:14px;font-weight:900;cursor:pointer;white-space:nowrap;transition:.2s}
      #mwCategoryShell button:hover{border-color:#D4AF37;background:rgba(212,175,55,.14)}
      #mwCategoryShell button.active{background:linear-gradient(135deg,#D4AF37,#FFDF73);color:#111827;border-color:#D4AF37;box-shadow:0 6px 18px rgba(212,175,55,.22)}
      @media(max-width:720px){#mwCategoryShell{border-radius:12px;padding:8px;margin-inline:-2px}#mwCategoryShell button{font-size:13px;padding:8px 12px}}
    `;
  }

  function visibleFrontCategory(id){
    if(!id)return true;const c=state.frontCategories.get(String(id));if(!c||c.is_visible===false)return false;
    if(c.parent_id){const p=state.frontCategories.get(String(c.parent_id));if(!p||p.is_visible===false)return false}
    return true;
  }

  function selectedCategoryFromUrl(){return String(new URLSearchParams(location.search).get('category')||'all').trim()||'all'}
  function updateCategoryUrl(value){const u=new URL(location.href);if(value==='all')u.searchParams.delete('category');else u.searchParams.set('category',value);history.replaceState(history.state,'',u.toString())}
  function frontRoots(){return[...state.frontCategories.values()].filter(c=>c.parent_id==null&&c.is_visible!==false).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)||String(a.name).localeCompare(String(b.name),'ar'))}
  function frontChildren(parentId){return[...state.frontCategories.values()].filter(c=>c.parent_id!=null&&String(c.parent_id)===String(parentId)&&c.is_visible!==false).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)||String(a.name).localeCompare(String(b.name),'ar'))}

  function productMatches(meta,filter){
    const selected=String(filter||'all');
    if(selected==='all')return true;
    if(!meta||meta.category_id==null||String(meta.category_id).trim()==='')return true;
    if(!visibleFrontCategory(meta.category_id))return false;
    if(selected==='featured')return!!meta.is_featured;
    if(selected==='general')return!meta.category_id;
    if(selected.startsWith('cat:'))return String(meta.category_id)===String(selected.slice(4));
    const root=frontRoots().find(c=>String(c.slug)===selected);if(!root)return true;
    if(String(meta.category_id)===String(root.id))return true;
    const c=state.frontCategories.get(String(meta.category_id));return String(c?.parent_id||'')===String(root.id);
  }

  function applyFrontFilter(filter,{updateUrl=true}={}){
    const grid=document.getElementById('localStoreProductsGrid');if(!grid)return;
    const selected=String(filter||'all');
    grid.querySelectorAll('.local-v3-card[data-product-card]').forEach(card=>{
      const meta=state.frontProducts.get(String(card.dataset.productCard));
      const show=productMatches(meta,selected);
      card.style.setProperty('display',show?'flex':'none','important');
    });
    document.querySelectorAll('#mwCategoryShell [data-cat-filter]').forEach(b=>b.classList.toggle('active',String(b.dataset.catFilter)===selected));
    if(updateUrl)updateCategoryUrl(selected);
  }

  function renderCategoryShell(){
    const grid=document.getElementById('localStoreProductsGrid'),container=ensureProductsContainer();if(!grid||!container)return;
    cleanupLegacyCategoryBars();
    let shell=document.createElement('div');shell.id='mwCategoryShell';shell.innerHTML='<div class="mw-category-bar" data-main-row></div><div class="mw-subcategory-bar" data-sub-row></div>';
    container.insertBefore(shell,grid);cleanupLegacyCategoryBars(shell);
    const main=shell.querySelector('[data-main-row]'),sub=shell.querySelector('[data-sub-row]');
    const rs=frontRoots(),hasGeneral=[...state.frontProducts.values()].some(p=>!p.category_id),tabs=[['all','الكل'],['featured','⭐ المميزة'],...(hasGeneral?[['general','عام']]:[]),...rs.map(c=>[c.slug,c.name])];
    main.innerHTML=tabs.map(([v,l])=>`<button type="button" data-cat-filter="${esc(v)}">${esc(l)}</button>`).join('');
    const showSubs=(filter,selected='')=>{
      const root=rs.find(c=>String(c.slug)===String(filter));if(!root){sub.innerHTML='';return}
      const list=frontChildren(root.id);if(!list.length){sub.innerHTML='';return}
      sub.innerHTML=`<button type="button" data-cat-filter="${esc(root.slug)}">كل ${esc(root.name)}</button>`+list.map(c=>`<button type="button" data-cat-filter="cat:${esc(c.id)}">${esc(c.name)}</button>`).join('');
      [...sub.querySelectorAll('[data-cat-filter]')].forEach(b=>b.classList.toggle('active',String(b.dataset.catFilter)===String(selected||filter)));
    };
    shell.onclick=e=>{const b=e.target.closest?.('[data-cat-filter]');if(!b)return;const f=String(b.dataset.catFilter||'all');if(b.closest('[data-main-row]'))showSubs(f);applyFrontFilter(f)};
    const wanted=selectedCategoryFromUrl();let valid=tabs.some(([v])=>String(v)===wanted)?wanted:'';
    if(!valid&&wanted.startsWith('cat:')){const child=state.frontCategories.get(wanted.slice(4));if(child?.parent_id){const root=state.frontCategories.get(String(child.parent_id));if(root&&root.is_visible!==false){valid=wanted;showSubs(root.slug,wanted)}}}
    if(!valid)valid='all';if(!wanted.startsWith('cat:'))showSubs(valid);applyFrontFilter(valid,{updateUrl:false});
  }

  async function initStorefront(storeId){
    const sid=String(storeId||new URLSearchParams(location.search).get('storeId')||'').trim();if(!sid)return;
    state.frontStoreId=sid;injectCss();injectStorefrontCss();cleanupLegacyCategoryBars();ensureProductsContainer();
    const [cats,products]=await Promise.all([
      rest(`store_categories?select=id,parent_id,name,slug,sort_order,is_visible&store_id=eq.${q(sid)}&order=sort_order.asc,name.asc`),
      rest(`local_products?select=id,category_id,is_featured&store_id=eq.${q(sid)}`)
    ]);
    state.frontCategories=new Map((Array.isArray(cats)?cats:[]).map(c=>[String(c.id),c]));
    state.frontProducts=new Map((Array.isArray(products)?products:[]).map(p=>[String(p.id),p]));
    renderCategoryShell();
    const grid=document.getElementById('localStoreProductsGrid');
    state.frontObserver?.disconnect?.();
    if(grid){state.frontObserver=new MutationObserver(()=>setTimeout(()=>{cleanupLegacyCategoryBars(document.getElementById('mwCategoryShell'));applyFrontFilter(selectedCategoryFromUrl(),{updateUrl:false})},0));state.frontObserver.observe(grid,{childList:true,subtree:false})}
  }

  function startStorefront(){
    injectCss();injectStorefrontCss();cleanupLegacyCategoryBars();
    const sid=String(new URLSearchParams(location.search).get('storeId')||'').trim();if(sid)setTimeout(()=>initStorefront(sid).catch(e=>console.warn('Store categories storefront init failed',e)),250);
  }

  function start(){
    const vendor=!!document.getElementById('productModal')||/vendor-dashboard(?:-v2)?\.html$/i.test(location.pathname);
    if(vendor)startVendor().catch(e=>console.error('Store categories vendor init failed',e));else startStorefront();
  }

  window.MeshwarStoreCategoriesV9={initStorefront,loadVendorCategories,refreshProductCategoryFields};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();