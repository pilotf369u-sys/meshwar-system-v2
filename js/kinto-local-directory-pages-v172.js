/* V172: read-only DOM pagination for existing local store cards. No store fetches or business logic. */
(()=>{'use strict';
const SIZE=12;
function attach(gridId,cardSelector,scopeId){
 const grid=document.getElementById(gridId),scope=document.getElementById(scopeId);
 if(!grid||!scope||grid.dataset.kintoV172Pages)return;
 grid.dataset.kintoV172Pages='1';
 let page=1,signature='',busy=false;
 const makeNav=where=>{const n=document.createElement('nav');n.className='kinto-v172-pages';n.setAttribute('aria-label','صفحات المتاجر المحلية');n.dataset.position=where;return n};
 const top=makeNav('top'),bottom=makeNav('bottom');
 grid.before(top);grid.after(bottom);
 const cards=()=>Array.from(grid.querySelectorAll(':scope > '+cardSelector));
 function draw(){
  if(busy)return;busy=true;
  const all=cards(),homeSearch=gridId==='localStoresPublicGrid'?document.getElementById('kintoV172LocalSearch'):null,term=String(homeSearch?.value||'').trim().toLocaleLowerCase(),matching=term?all.filter(el=>String(el.textContent||'').toLocaleLowerCase().includes(term)):all,key=all.map(el=>el.getAttribute('data-kinto-store-id')||el.querySelector('a[href*="storeId="]')?.getAttribute('href')||el.textContent?.trim()||'').join('|');
  if(key!==signature){signature=key;page=1}
  const total=Math.max(1,Math.ceil(matching.length/SIZE));page=Math.min(page,total);const productView=gridId==='localStoresPublicGrid'&&document.getElementById('localStoreProductsPanel')?.style.display==='block';
  all.forEach(el=>{const i=matching.indexOf(el);el.hidden=i<0||i<(page-1)*SIZE||i>=page*SIZE;el.style.display=el.hidden?'none':''});
  for(const nav of [top,bottom]){
   nav.replaceChildren();nav.hidden=matching.length<=SIZE||productView;
   if(nav.hidden)continue;
   const add=(label,to,disabled,current)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.disabled=disabled;b.className=current?'active':'';if(current)b.setAttribute('aria-current','page');b.addEventListener('click',()=>{page=to;draw();if(nav===bottom)top.scrollIntoView({block:'nearest',behavior:'auto'})});nav.append(b)};
   add('السابق',page-1,page===1,false);
   const start=Math.max(1,Math.min(page-2,total-4)),end=Math.min(total,start+4);
   for(let i=start;i<=end;i++)add(String(i),i,false,i===page);
   add('التالي',page+1,page===total,false);
  }
  busy=false;
 }
 const observer=new MutationObserver(()=>{if(!busy)draw()});
 observer.observe(grid,{childList:true});if(gridId==='localStoresPublicGrid'){const panel=document.getElementById('localStoreProductsPanel');if(panel)new MutationObserver(draw).observe(panel,{attributes:true,attributeFilter:['style']});}
 const search=scope.querySelector('#storeSearch');
 search?.addEventListener('input',()=>{signature='';queueMicrotask(draw)});const homeSearch=gridId==='localStoresPublicGrid'?document.getElementById('kintoV172LocalSearch'):null;homeSearch?.addEventListener('input',()=>{page=1;draw()});
 scope.addEventListener('click',e=>{if(e.target.closest('.filter-btn, [data-filter]')){signature='';queueMicrotask(draw)}});
 draw();
}
const css=document.createElement('style');css.textContent='.kinto-v172-pages{display:flex;justify-content:center;gap:7px;flex-wrap:wrap;margin:15px 0;min-height:38px}.kinto-v172-pages[hidden]{display:none}.kinto-v172-pages button{border:1px solid rgba(229,185,63,.38);border-radius:11px;padding:8px 12px;background:#103d34;color:#f8ead0;font-weight:800;cursor:pointer}.kinto-v172-pages button.active{background:#e5b93f;color:#12332a}.kinto-v172-pages button:disabled{opacity:.4;cursor:default}';document.head.append(css);
function init(){attach('storesGrid','.card','main');attach('localStoresPublicGrid','.local-public-card','localStoresPublic')}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();