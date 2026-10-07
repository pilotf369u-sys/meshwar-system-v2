/* KINTO V60 — client-side pagination for local products, deep-link aware */
(function(){
  const PAGE_SIZE=12;
  const GRID_ID='localStoreProductsGrid';
  const NAV_ID='kintoLocalProductsPaginationV60';
  const params=new URLSearchParams(location.search);
  const directProductId=['productId','product_id','product','pid']
    .map(key=>params.get(key))
    .find(value=>String(value||'').trim());
  const directPid=String(directProductId||'').trim();

  const style=document.createElement('style');
  style.id='kintoLocalPaginationV60Style';
  style.textContent=`
    #${NAV_ID}{
      grid-column:1/-1;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;
      width:100%;box-sizing:border-box;margin:22px 0 4px;padding:13px 14px;border-radius:16px;
      border:1px solid rgba(242,202,99,.28);background:rgba(2,43,36,.56);backdrop-filter:blur(12px);
      box-shadow:0 12px 30px rgba(0,0,0,.12)
    }
    #${NAV_ID}[hidden]{display:none!important}
    #${NAV_ID} .kinto-page-btn{
      min-width:38px;height:38px;padding:0 11px;border-radius:11px;border:1px solid rgba(242,202,99,.30);
      background:rgba(255,255,255,.06);color:#eaf6f2;font:800 12px/1 Arial,sans-serif;cursor:pointer;
      transition:transform .18s ease,border-color .18s ease,background .18s ease,box-shadow .18s ease
    }
    #${NAV_ID} .kinto-page-btn:hover:not(:disabled){transform:translateY(-2px);border-color:rgba(242,202,99,.72);background:rgba(242,202,99,.13)}
    #${NAV_ID} .kinto-page-btn[aria-current="page"]{background:linear-gradient(135deg,#f3cf68,#d9aa2c);color:#13241f;border-color:#ffe49c;box-shadow:0 6px 18px rgba(217,170,44,.24)}
    #${NAV_ID} .kinto-page-btn:disabled{opacity:.35;cursor:not-allowed}
    #${NAV_ID} .kinto-page-summary{margin-inline:6px;color:#c9dad5;font:800 11px/1.5 Arial,sans-serif;white-space:nowrap}
    @media(max-width:640px){#${NAV_ID}{gap:6px;padding:11px 9px}#${NAV_ID} .kinto-page-btn{min-width:34px;height:36px;padding:0 9px}#${NAV_ID} .kinto-page-summary{width:100%;text-align:center;order:-1}}
  `;
  if(!document.getElementById(style.id))document.head.appendChild(style);

  let currentPage=1;
  let lastSignature='';
  let applying=false;

  function grid(){return document.getElementById(GRID_ID)}
  function cards(){return [...(grid()?.querySelectorAll('.local-v3-card[data-product-card]')||[])]}
  function productId(card){return String(card?.dataset?.productCard||'').trim()}
  function totalPages(list){return Math.max(1,Math.ceil(list.length/PAGE_SIZE))}

  function pageForDirectProduct(list){
    if(!directPid)return null;
    const index=list.findIndex(card=>productId(card)===directPid);
    return index<0?null:Math.floor(index/PAGE_SIZE)+1;
  }

  function ensureNav(){
    const g=grid();if(!g)return null;
    let nav=document.getElementById(NAV_ID);
    if(!nav){
      nav=document.createElement('nav');
      nav.id=NAV_ID;
      nav.setAttribute('aria-label','صفحات المنتجات');
      g.insertAdjacentElement('afterend',nav);
    }
    return nav;
  }

  function pageButtons(page,total){
    const wanted=new Set([1,total,page-2,page-1,page,page+1,page+2]);
    const nums=[...wanted].filter(n=>n>=1&&n<=total).sort((a,b)=>a-b);
    const out=[];
    nums.forEach((n,i)=>{
      if(i&&n-nums[i-1]>1)out.push('<span class="kinto-page-summary" aria-hidden="true">…</span>');
      out.push(`<button type="button" class="kinto-page-btn" data-page="${n}" ${n===page?'aria-current="page"':''} aria-label="الصفحة ${n}">${n}</button>`);
    });
    return out.join('');
  }

  function renderNav(list,page,total){
    const nav=ensureNav();if(!nav)return;
    if(list.length<=PAGE_SIZE){nav.hidden=true;nav.innerHTML='';return}
    const start=(page-1)*PAGE_SIZE+1;
    const end=Math.min(page*PAGE_SIZE,list.length);
    nav.hidden=false;
    nav.innerHTML=`
      <button type="button" class="kinto-page-btn" data-action="prev" ${page<=1?'disabled':''} aria-label="الصفحة السابقة">السابق</button>
      ${pageButtons(page,total)}
      <button type="button" class="kinto-page-btn" data-action="next" ${page>=total?'disabled':''} aria-label="الصفحة التالية">التالي</button>
      <span class="kinto-page-summary">${start}–${end} من ${list.length} منتج</span>`;
    nav.onclick=e=>{
      const btn=e.target.closest('button');if(!btn||btn.disabled)return;
      let next=currentPage;
      if(btn.dataset.action==='prev')next--;
      else if(btn.dataset.action==='next')next++;
      else if(btn.dataset.page)next=Number(btn.dataset.page);
      showPage(next,{userInitiated:true});
    };
  }

  function showPage(requested,{userInitiated=false}={}){
    if(applying)return;
    const list=cards();if(!list.length)return;
    applying=true;
    try{
      const total=totalPages(list);
      currentPage=Math.min(total,Math.max(1,Number(requested)||1));
      const from=(currentPage-1)*PAGE_SIZE;
      const to=from+PAGE_SIZE;
      list.forEach((card,index)=>{
        if(index>=from&&index<to){
          card.style.removeProperty('display');
          card.removeAttribute('aria-hidden');
        }else{
          card.style.setProperty('display','none','important');
          card.setAttribute('aria-hidden','true');
        }
      });
      renderNav(list,currentPage,total);
      if(userInitiated){
        const g=grid();
        if(g)requestAnimationFrame(()=>g.scrollIntoView({behavior:'smooth',block:'start'}));
      }
      document.dispatchEvent(new CustomEvent('kinto:local-products-page',{detail:{page:currentPage,totalPages:total,pageSize:PAGE_SIZE,totalProducts:list.length}}));
    }finally{applying=false}
  }

  function applyForCurrentRender(){
    const list=cards();
    if(!list.length){const nav=document.getElementById(NAV_ID);if(nav)nav.hidden=true;return}
    const signature=list.map(productId).join('|');
    if(signature!==lastSignature){
      lastSignature=signature;
      currentPage=pageForDirectProduct(list)||1;
    }else{
      const linkedPage=pageForDirectProduct(list);
      if(linkedPage&&directPid&&list.find(card=>productId(card)===directPid)?.style.display==='none')currentPage=linkedPage;
    }
    showPage(currentPage);
  }

  function start(){
    const g=grid();if(!g){setTimeout(start,120);return}
    applyForCurrentRender();
    const observer=new MutationObserver(mutations=>{
      if(applying)return;
      if(mutations.some(m=>m.type==='childList'))queueMicrotask(applyForCurrentRender);
    });
    observer.observe(g,{childList:true,subtree:false});
    window.addEventListener('resize',()=>renderNav(cards(),currentPage,totalPages(cards())),{passive:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
