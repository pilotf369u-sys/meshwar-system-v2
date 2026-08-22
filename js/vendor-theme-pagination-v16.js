/* MESHWAR_VENDOR_THEME_PAGINATION_V16 */
(function(){
  const states=new WeakMap();
  const CONFIG={
    orders:{container:'#ordersBody',item:':scope > tr',anchor:'#vendorTab-orders .vendor-table-wrap',label:'الطلبات'},
    products:{container:'#productsBody',item:':scope > tr',anchor:'#vendorTab-products .vendor-table-wrap',label:'المنتجات'},
    categories:{container:'#mwCatList',item:':scope > .mw-cat-group',anchor:'#mwCatList',label:'التصنيفات'}
  };

  function state(win){
    if(!states.has(win))states.set(win,{pages:{orders:1,products:1,categories:1},sizes:{orders:10,products:10,categories:10},observers:{}});
    return states.get(win);
  }

  function injectContrastCss(win){
    const d=win.document;if(d.getElementById('mwVendorThemePaginationV16Css'))return;
    const style=d.createElement('style');style.id='mwVendorThemePaginationV16Css';style.textContent=`
      html.light body{background:#f8fafc!important;color:#0f172a!important;background-image:none!important}
      html.light header{background:rgba(255,255,255,.96)!important;border-color:#cbd5e1!important;color:#0f172a!important}
      html.light .glass{background:#fff!important;border-color:#cbd5e1!important;box-shadow:0 10px 30px rgba(15,23,42,.08)!important}
      html.light .vendor-text,html.light h1,html.light h2,html.light h3,html.light th,html.light td{color:#0f172a!important}
      html.light .vendor-muted,html.light .text-slate-300,html.light .text-slate-400,html.light .text-slate-500{color:#475569!important}
      html.light .field,html.light input:not([type=checkbox]):not([type=radio]),html.light select,html.light textarea{background:#fff!important;color:#0f172a!important;border-color:#94a3b8!important;box-shadow:inset 0 0 0 1px rgba(15,23,42,.02)}
      html.light .field::placeholder,html.light input::placeholder,html.light textarea::placeholder{color:#64748b!important;opacity:1!important}
      html.light button{opacity:1!important}
      html.light .vendor-main-tab,html.light .vendor-order-filter{background:#fff!important;color:#1e293b!important;border-color:#94a3b8!important;box-shadow:0 2px 8px rgba(15,23,42,.06)}
      html.light .vendor-main-tab.active,html.light .vendor-order-filter.active{background:#2563eb!important;color:#fff!important;border-color:#1d4ed8!important}
      html.light .mw-cat-shell,html.light .mw-cat-group,html.light .mw-cat-row{background:#fff!important;border-color:#cbd5e1!important;color:#0f172a!important}
      html.light .mw-cat-form label,html.light .mw-cat-name{color:#0f172a!important}
      html.light .mw-cat-meta{color:#475569!important}
      html.light .mw-cat-form input,html.light .mw-cat-form select{background:#fff!important;color:#0f172a!important;border-color:#94a3b8!important}
      html.light .border-white\/10,html.light .border-white\/5{border-color:#cbd5e1!important}
      html.light .bg-white\/5{background:rgba(241,245,249,.92)!important}

      html.dark body{color:#f8fafc!important}
      html.dark .glass{background:rgba(30,41,59,.88)!important;border-color:rgba(148,163,184,.24)!important}
      html.dark .field,html.dark input:not([type=checkbox]):not([type=radio]),html.dark select,html.dark textarea{background:#172033!important;color:#f8fafc!important;border-color:#475569!important}
      html.dark .field::placeholder,html.dark input::placeholder,html.dark textarea::placeholder{color:#cbd5e1!important;opacity:.82!important}
      html.dark .vendor-muted,html.dark .text-slate-400{color:#cbd5e1!important}
      html.dark .text-slate-500{color:#94a3b8!important}
      html.dark .text-slate-300{color:#e2e8f0!important}
      html.dark .vendor-main-tab,html.dark .vendor-order-filter{border-color:#475569!important;background:rgba(51,65,85,.52)!important;color:#e2e8f0!important}
      html.dark .vendor-main-tab.active,html.dark .vendor-order-filter.active{background:#2563eb!important;color:#fff!important;border-color:#60a5fa!important}
      html.dark .mw-cat-shell,html.dark .mw-cat-group{border-color:rgba(203,213,225,.2)!important;background:rgba(30,41,59,.5)!important}
      html.dark .mw-cat-row{background:rgba(51,65,85,.4)!important}
      html.dark .mw-cat-form label,html.dark .mw-cat-name{color:#f1f5f9!important}
      html.dark .mw-cat-meta{color:#cbd5e1!important}
      html.dark .mw-cat-form input,html.dark .mw-cat-form select{background:#172033!important;color:#f8fafc!important;border-color:#475569!important}

      .mw-page-hidden{display:none!important}
      .mw-vendor-pager{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin-top:14px;padding:10px 12px;border:1px solid rgba(148,163,184,.25);border-radius:14px;background:rgba(15,23,42,.18)}
      .mw-vendor-pager-info{font-size:12px;font-weight:800;color:#cbd5e1}
      .mw-vendor-pager-controls{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
      .mw-vendor-pager button{min-width:36px;height:34px;padding:0 10px;border-radius:9px;border:1px solid rgba(148,163,184,.32);background:rgba(51,65,85,.72);color:#f8fafc;font-size:12px;font-weight:900;cursor:pointer}
      .mw-vendor-pager button:hover:not(:disabled){border-color:#38bdf8;transform:translateY(-1px)}
      .mw-vendor-pager button.active{background:#2563eb;border-color:#60a5fa;color:#fff}
      .mw-vendor-pager button:disabled{opacity:.42;cursor:not-allowed}
      .mw-vendor-pager select{height:34px;border-radius:9px;border:1px solid rgba(148,163,184,.35);background:#172033;color:#f8fafc;padding:0 8px;font-size:12px;font-weight:800}
      html.light .mw-vendor-pager{background:#f8fafc;border-color:#cbd5e1}
      html.light .mw-vendor-pager-info{color:#334155!important}
      html.light .mw-vendor-pager button{background:#fff;color:#0f172a;border-color:#94a3b8}
      html.light .mw-vendor-pager button.active{background:#2563eb;color:#fff;border-color:#1d4ed8}
      html.light .mw-vendor-pager select{background:#fff!important;color:#0f172a!important;border-color:#94a3b8!important}
      @media(max-width:640px){.mw-vendor-pager{justify-content:center}.mw-vendor-pager-info{width:100%;text-align:center}.mw-vendor-pager-controls{justify-content:center}}
    `;d.head.appendChild(style);
  }

  function getItems(win,key){
    const cfg=CONFIG[key],container=win.document.querySelector(cfg.container);if(!container)return [];
    return [...container.querySelectorAll(cfg.item)].filter(el=>{
      if(key!=='categories'&&!el.querySelector('td'))return false;
      return el.style.display!=='none';
    });
  }

  function allItems(win,key){
    const cfg=CONFIG[key],container=win.document.querySelector(cfg.container);if(!container)return [];
    return [...container.querySelectorAll(cfg.item)].filter(el=>key==='categories'||!!el.querySelector('td'));
  }

  function pageNumbers(current,total){
    if(total<=7)return Array.from({length:total},(_,i)=>i+1);
    const set=new Set([1,total,current-2,current-1,current,current+1,current+2]);
    return [...set].filter(n=>n>=1&&n<=total).sort((a,b)=>a-b);
  }

  function ensurePager(win,key){
    const d=win.document,cfg=CONFIG[key],id=`mwVendorPager-${key}`;let pager=d.getElementById(id);if(pager)return pager;
    const anchor=d.querySelector(cfg.anchor);if(!anchor)return null;
    pager=d.createElement('div');pager.id=id;pager.className='mw-vendor-pager';pager.dataset.pagerKey=key;
    pager.innerHTML=`<div class="mw-vendor-pager-info" data-pager-info>—</div><div class="mw-vendor-pager-controls"><label style="font-size:11px;font-weight:800;display:flex;align-items:center;gap:5px">لكل صفحة <select data-page-size><option value="10">10</option><option value="20">20</option></select></label><button type="button" data-page-action="prev">السابق</button><span data-page-numbers style="display:flex;gap:5px;flex-wrap:wrap"></span><button type="button" data-page-action="next">التالي</button></div>`;
    if(key==='categories')anchor.insertAdjacentElement('afterend',pager);else anchor.insertAdjacentElement('afterend',pager);
    const st=state(win);pager.querySelector('[data-page-size]').value=String(st.sizes[key]);
    pager.addEventListener('change',e=>{if(e.target.matches('[data-page-size]')){st.sizes[key]=Number(e.target.value)||10;st.pages[key]=1;applyPagination(win,key)}});
    pager.addEventListener('click',e=>{
      const btn=e.target.closest('button');if(!btn)return;
      const action=btn.dataset.pageAction;
      if(action==='prev')st.pages[key]=Math.max(1,st.pages[key]-1);
      else if(action==='next')st.pages[key]++;
      else if(btn.dataset.page)st.pages[key]=Number(btn.dataset.page)||1;
      applyPagination(win,key);
    });
    return pager;
  }

  function applyPagination(win,key,{reset=false}={}){
    const st=state(win),cfg=CONFIG[key],pager=ensurePager(win,key);if(!pager)return;
    if(reset)st.pages[key]=1;
    const every=allItems(win,key);every.forEach(el=>el.classList.remove('mw-page-hidden'));
    const items=getItems(win,key),size=st.sizes[key]||10,total=items.length,pages=Math.max(1,Math.ceil(total/size));
    st.pages[key]=Math.min(Math.max(1,st.pages[key]||1),pages);
    const start=(st.pages[key]-1)*size,end=Math.min(start+size,total);
    items.forEach((el,i)=>el.classList.toggle('mw-page-hidden',i<start||i>=end));
    const info=pager.querySelector('[data-pager-info]');
    if(info)info.textContent=total?`${cfg.label}: ${start+1}–${end} من ${total}`:`${cfg.label}: لا توجد عناصر`;
    const nums=pager.querySelector('[data-page-numbers]');
    if(nums){
      const list=pageNumbers(st.pages[key],pages);let previous=0;
      nums.innerHTML=list.map(n=>`${previous&&n-previous>1?'<span style="align-self:center;color:#94a3b8">…</span>':''}<button type="button" data-page="${n}" class="${n===st.pages[key]?'active':''}">${n}</button>${(previous=n)&&''}`).join('');
    }
    const prev=pager.querySelector('[data-page-action="prev"]'),next=pager.querySelector('[data-page-action="next"]');
    if(prev)prev.disabled=st.pages[key]<=1;if(next)next.disabled=st.pages[key]>=pages;
    pager.style.display=total<=size?'flex':'flex';
  }

  function observe(win,key){
    const st=state(win);if(st.observers[key])return;
    const cfg=CONFIG[key],container=win.document.querySelector(cfg.container);if(!container)return;
    const ob=new win.MutationObserver(()=>setTimeout(()=>applyPagination(win,key),0));
    ob.observe(container,{childList:true,subtree:key==='categories'});st.observers[key]=ob;
  }

  function bindInteractions(win){
    if(win.__mwVendorPaginationInteractions)return;win.__mwVendorPaginationInteractions=true;
    win.document.addEventListener('input',e=>{
      if(e.target?.id==='vendorOrderSmartSearch')setTimeout(()=>applyPagination(win,'orders',{reset:true}),0);
      if(e.target?.id==='vendorSmartProductSearch')setTimeout(()=>applyPagination(win,'products',{reset:true}),0);
    },true);
    win.document.addEventListener('click',e=>{
      if(e.target.closest?.('[data-order-filter]'))setTimeout(()=>applyPagination(win,'orders',{reset:true}),0);
      if(e.target.closest?.('#vendorTabBtn-products'))setTimeout(()=>applyPagination(win,'products'),0);
      if(e.target.closest?.('#vendorTabBtn-categories'))setTimeout(()=>applyPagination(win,'categories'),60);
    },true);
  }

  function install(win){
    if(!win)return;
    const boot=()=>{
      injectContrastCss(win);bindInteractions(win);
      ['orders','products','categories'].forEach(key=>{ensurePager(win,key);observe(win,key);applyPagination(win,key)});
      let attempts=0;const timer=win.setInterval(()=>{
        attempts++;injectContrastCss(win);
        ['orders','products','categories'].forEach(key=>{ensurePager(win,key);observe(win,key);applyPagination(win,key)});
        if(attempts>40||win.document.getElementById('mwVendorPager-categories'))win.clearInterval(timer);
      },250);
    };
    if(win.document.readyState==='loading')win.document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  }

  window.MeshwarVendorThemePaginationV16={install,applyPagination,injectContrastCss};
})();
