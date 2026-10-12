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
   nav.replaceChildren();nav.hidden=productView;
   if(nav.hidden)continue;
   const info=document.createElement('span');info.className='kinto-v174-page-info';info.textContent='صفحة '+page+' من '+total+' — '+matching.length+' متاجر';nav.append(info);
   if(total===1)continue;
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
const css=document.createElement('style');css.textContent='.kinto-v172-pages{display:flex;justify-content:center;gap:7px;flex-wrap:wrap;margin:15px 0;min-height:38px}.kinto-v172-pages[hidden]{display:none}.kinto-v172-pages button{border:1px solid rgba(229,185,63,.38);border-radius:11px;padding:8px 12px;background:#103d34;color:#f8ead0;font-weight:800;cursor:pointer}.kinto-v172-pages button.active{background:#e5b93f;color:#12332a}.kinto-v172-pages button:disabled{opacity:.4;cursor:default} .kinto-v174-page-info{display:inline-flex;align-items:center;color:#e7d7a6;font-size:12px;font-weight:800;padding:7px 10px;border:1px solid rgba(229,185,63,.2);border-radius:10px;background:rgba(255,255,255,.04)}';document.head.append(css);
function init(){attach('storesGrid','.card','main');attach('localStoresPublicGrid','.local-public-card','localStoresPublic')}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();

function decorate(){
 const global=document.querySelector('.kinto-v172-global-link');
 if(global&&!global.dataset.v173){
  global.dataset.v173='1';
  const globe=global.querySelector('.kinto-v172-global-icon');
  if(globe){globe.textContent='';globe.innerHTML='<i class="fa-solid fa-earth-europe" aria-hidden="true"></i>';}
  const logos=document.createElement('span');logos.className='kinto-v173-brands';logos.setAttribute('aria-label','ترنديول وزارا وN11');logos.innerHTML='<b class="trendyol">trendyol</b><b class="zara">ZARA</b><b class="n11">n11</b>';global.insertBefore(logos,global.lastElementChild);
 }
 const local=document.querySelector('#localStoresPublic .local-stores-head h2');
 if(local&&!local.dataset.v173){local.dataset.v173='1';local.innerHTML='<i class="fa-solid fa-store" aria-hidden="true"></i> المتاجر المحلية';}
 document.querySelectorAll('#localSpecialtyFilters .local-filter-btn, #filters .filter-btn').forEach(btn=>{
  if(btn.dataset.v173)return;btn.dataset.v173='1';
  const label=String(btn.dataset.specialty||btn.dataset.filter||btn.textContent||'').trim();
  const cls=/سيار|عجلات|إطار/.test(label)?'car-side':/ملابس|أزياء|موضة/.test(label)?'shirt':/إلكترون|تقني|هاتف/.test(label)?'mobile-screen-button':/تجميل|عطور/.test(label)?'spray-can-sparkles':/طعام|غذاء|مطعم/.test(label)?'utensils':/يدوي|حرف|فن/.test(label)?'palette':/منزل|أثاث/.test(label)?'house':label==='الكل'?'border-all':'shapes';
  const i=document.createElement('i');i.className='fa-solid fa-'+cls;i.setAttribute('aria-hidden','true');btn.prepend(i);
 });
}
const v173=document.createElement('style');v173.textContent='.kinto-v172-global-icon{display:grid;place-items:center;width:45px;height:45px;flex:none;border-radius:15px;background:linear-gradient(140deg,rgba(255,255,255,.21),rgba(255,255,255,.05));border:1px solid rgba(255,255,255,.3);box-shadow:inset 0 1px rgba(255,255,255,.22);font-size:22px;color:#f2cf6b}.kinto-v173-brands{display:flex;align-items:center;gap:4px;flex:none;direction:ltr}.kinto-v173-brands b{font-size:9px;font-weight:900;padding:6px 5px;border-radius:8px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);color:#fff;white-space:nowrap}.kinto-v173-brands .trendyol{color:#ff9a4c}.kinto-v173-brands .zara{font-family:serif;letter-spacing:1px}.kinto-v173-brands .n11{color:#f6d64b}#localSpecialtyFilters .local-filter-btn,#filters .filter-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border-radius:14px!important;border:1px solid rgba(255,255,255,.3)!important;background:linear-gradient(140deg,rgba(255,255,255,.22),rgba(255,255,255,.09))!important;backdrop-filter:blur(15px);-webkit-backdrop-filter:blur(15px);color:#fff!important;box-shadow:inset 0 1px rgba(255,255,255,.25);font-size:12px!important;padding:9px 13px!important;transform:none!important}#localSpecialtyFilters .local-filter-btn.active,#filters .filter-btn.active{background:linear-gradient(140deg,#e8c75d,#cfa339)!important;color:#183a31!important}#localSpecialtyFilters .local-filter-btn i,#filters .filter-btn i{font-size:13px}#localStoresPublic .local-public-name{color:#f8fbfa!important;text-shadow:none!important}#localStoresPublic .local-public-meta{color:#b8ccc8!important}#localStoresPublic .local-stores-head h2{color:#f7f6ec!important}#localStoresPublic .local-stores-head h2 i{display:inline-grid;place-items:center;width:35px;height:35px;margin-left:7px;border-radius:11px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);color:#f1cd6c;font-size:17px}@media(max-width:560px){.kinto-v173-brands b{font-size:8px;padding:5px 4px}.kinto-v172-global-link{gap:9px!important}.kinto-v172-global-icon{width:37px;height:37px;font-size:18px}.kinto-v173-brands{gap:3px}}';document.head.append(v173);
const v173Observer=new MutationObserver(decorate);
function initDecor(){decorate();for(const id of ['localSpecialtyFilters','filters']){const node=document.getElementById(id);if(node)v173Observer.observe(node,{childList:true});}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initDecor,{once:true});else initDecor();

})();