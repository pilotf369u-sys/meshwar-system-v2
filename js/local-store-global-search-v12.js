/* MESHWAR_LOCAL_STORE_GLOBAL_SEARCH_V12 */
(function(){
  const SB_URL='https://hsmmbloouskqdnptiiad.supabase.co';
  const SB_KEY='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
  const state={storeId:'',products:new Map(),query:'',observer:null,debounce:null,installed:false};

  const q=v=>encodeURIComponent(String(v??''));
  const normalize=v=>String(v??'').trim().toLocaleLowerCase('ar');

  async function rest(path){
    const r=await fetch(`${SB_URL}/rest/v1/${path}`,{cache:'no-store',headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`,Accept:'application/json'}});
    if(!r.ok)throw new Error(await r.text()||`HTTP ${r.status}`);
    const t=await r.text();return t?JSON.parse(t):null;
  }

  function currentStoreId(){
    return String(new URLSearchParams(location.search).get('storeId')||state.storeId||'').trim();
  }

  function injectCss(){
    if(document.getElementById('mwGlobalStoreSearchCss'))return;
    const s=document.createElement('style');s.id='mwGlobalStoreSearchCss';s.textContent=`
      #mwGlobalStoreSearch{position:relative;z-index:51;margin:0 0 12px;padding:12px;border:1px solid rgba(56,189,248,.24);border-radius:16px;background:rgba(15,23,42,.94);box-shadow:0 10px 28px rgba(2,6,23,.18);backdrop-filter:blur(14px)}
      #mwGlobalStoreSearch .mw-global-search-row{display:flex;align-items:center;gap:8px}
      #mwGlobalStoreSearch input{width:100%;min-width:0;box-sizing:border-box;border:1px solid rgba(148,163,184,.28);border-radius:12px;background:#fff;color:#0f172a;padding:11px 13px;font-size:14px;font-weight:700;outline:none}
      #mwGlobalStoreSearch input:focus{border-color:#38bdf8;box-shadow:0 0 0 3px rgba(56,189,248,.12)}
      #mwGlobalStoreSearch button{flex:0 0 auto;border:1px solid rgba(212,175,55,.42);border-radius:12px;background:linear-gradient(135deg,#D4AF37,#FFDF73);color:#111827;padding:10px 14px;font-weight:900;cursor:pointer}
      #mwGlobalStoreSearchStatus{margin-top:7px;color:#94a3b8;font-size:11px;font-weight:700}
      html.dark #mwGlobalStoreSearch input{background:#0f172a;color:#f8fafc;border-color:rgba(148,163,184,.28)}
      @media(max-width:640px){#mwGlobalStoreSearch{padding:9px;border-radius:12px}#mwGlobalStoreSearch button{padding:10px 11px}#mwGlobalStoreSearch input{font-size:13px}}
    `;document.head.appendChild(s);
  }

  function ensureUi(){
    const grid=document.getElementById('localStoreProductsGrid');
    if(!grid)return null;
    const container=document.getElementById('local-store-products-container')||grid.parentElement;
    if(!container)return null;
    let box=document.getElementById('mwGlobalStoreSearch');
    if(!box){
      box=document.createElement('div');box.id='mwGlobalStoreSearch';
      box.innerHTML='<div class="mw-global-search-row"><input id="mwGlobalStoreSearchInput" type="search" autocomplete="off" inputmode="search" placeholder="ابحث باسم المنتج أو امسح الباركود"><button id="mwGlobalStoreSearchBtn" type="button">بحث</button></div><div id="mwGlobalStoreSearchStatus">البحث شامل جميع أقسام هذا المتجر.</div>';
      container.insertBefore(box,container.firstChild||grid);
      const input=box.querySelector('#mwGlobalStoreSearchInput');
      input?.addEventListener('input',()=>{
        clearTimeout(state.debounce);
        state.debounce=setTimeout(()=>runSearch(input.value),180);
      });
      input?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();clearTimeout(state.debounce);runSearch(input.value)}});
      box.querySelector('#mwGlobalStoreSearchBtn')?.addEventListener('click',()=>runSearch(input?.value||''));
    }
    return box;
  }

  function isAvailable(p){
    if(!p||p.is_out_of_stock===true)return false;
    const raw=p.stock_quantity;
    if(raw===null||raw===undefined||raw==='')return true;
    return Number(raw)>0;
  }

  function matches(p,query){
    if(!isAvailable(p))return false;
    const term=normalize(query);if(!term)return true;
    const name=normalize(p.product_name),barcode=normalize(p.barcode);
    return name.includes(term)||barcode.includes(term);
  }

  function applySearch(){
    const grid=document.getElementById('localStoreProductsGrid');if(!grid)return;
    const term=normalize(state.query);if(!term)return;
    let shown=0;
    grid.querySelectorAll('.local-v3-card[data-product-card]').forEach(card=>{
      const p=state.products.get(String(card.dataset.productCard));
      const show=matches(p,term);
      card.style.setProperty('display',show?'flex':'none','important');
      if(show)shown++;
    });
    const status=document.getElementById('mwGlobalStoreSearchStatus');
    if(status)status.textContent=shown?`تم العثور على ${shown} منتج متاح في جميع الأقسام.`:'لا توجد منتجات متاحة مطابقة للبحث.';
  }

  async function restoreCategoryFilter(){
    const sid=currentStoreId();
    const status=document.getElementById('mwGlobalStoreSearchStatus');
    if(status)status.textContent='البحث شامل جميع أقسام هذا المتجر.';
    if(sid&&typeof window.MeshwarStoreCategoriesV9?.initStorefront==='function'){
      try{await window.MeshwarStoreCategoriesV9.initStorefront(sid);return}catch(e){console.warn('Global search category restore failed',e)}
    }
    document.querySelectorAll('#localStoreProductsGrid .local-v3-card[data-product-card]').forEach(card=>card.style.removeProperty('display'));
  }

  async function runSearch(value){
    const term=String(value??'').trim();state.query=term;
    if(!term){await restoreCategoryFilter();return}
    if(!state.products.size)await loadProducts(currentStoreId());
    applySearch();
  }

  async function loadProducts(storeId){
    const sid=String(storeId||currentStoreId()).trim();if(!sid)return;
    state.storeId=sid;
    const rows=await rest(`local_products?select=id,product_name,barcode,stock_quantity,is_out_of_stock&store_id=eq.${q(sid)}&order=created_at.desc`);
    state.products=new Map((Array.isArray(rows)?rows:[]).map(p=>[String(p.id),p]));
  }

  function observeGrid(){
    const grid=document.getElementById('localStoreProductsGrid');if(!grid)return;
    state.observer?.disconnect?.();
    state.observer=new MutationObserver(()=>{ensureUi();if(normalize(state.query))setTimeout(applySearch,0)});
    state.observer.observe(grid,{childList:true,subtree:false});
  }

  async function init(storeId){
    const sid=String(storeId||currentStoreId()).trim();if(!sid)return;
    state.storeId=sid;injectCss();ensureUi();observeGrid();
    try{await loadProducts(sid);if(normalize(state.query))applySearch()}catch(e){console.warn('Global storefront search load failed',e)}
  }

  function install(){
    if(state.installed)return;state.installed=true;injectCss();
    document.addEventListener('click',e=>{
      if(!normalize(state.query))return;
      if(e.target.closest?.('#mwCategoryShell [data-cat-filter]'))setTimeout(applySearch,0);
    },true);
    const boot=()=>{
      const sid=currentStoreId();if(sid)init(sid);
      let tries=0;const timer=setInterval(()=>{tries++;ensureUi();if(document.getElementById('localStoreProductsGrid')){observeGrid();clearInterval(timer)}else if(tries>80)clearInterval(timer)},100);
    };
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  }

  window.MeshwarLocalStoreGlobalSearchV12={init,runSearch};
  install();
})();
