/* KINTO CUSTOMER PAGINATION V129 — scoped to customer dashboard lists. */
(function(){
'use strict';
const state=new Map();
function pageNumbers(current,total){
  if(total<=5)return Array.from({length:total},(_,i)=>i+1);
  const values=new Set([1,total,current-1,current,current+1]);
  return [...values].filter(n=>n>=1&&n<=total).sort((a,b)=>a-b);
}
function paint(key){
  const cfg=state.get(key);if(!cfg)return;
  const container=document.getElementById(cfg.containerId),pager=document.getElementById(cfg.pagerId);
  if(!container||!pager)return;
  const items=[...container.children].filter(node=>!node.querySelector?.('.empty-state')&&!node.classList.contains('empty-state'));
  const total=items.length,pages=Math.max(1,Math.ceil(total/cfg.pageSize));
  cfg.page=Math.min(Math.max(1,cfg.page),pages);
  items.forEach((item,index)=>{item.hidden=index<(cfg.page-1)*cfg.pageSize||index>=cfg.page*cfg.pageSize});
  if(total<=cfg.pageSize){pager.hidden=true;pager.innerHTML='';return}
  pager.hidden=false;
  const from=(cfg.page-1)*cfg.pageSize+1,to=Math.min(cfg.page*cfg.pageSize,total),numbers=pageNumbers(cfg.page,pages);
  let previous=0;
  const numbered=n=>{const gap=previous&&n-previous>1?'<span class="customer-page-gap" aria-hidden="true">…</span>':'';previous=n;return gap+`<button type="button" class="customer-page-number${n===cfg.page?' is-active':''}" data-page="${n}" aria-label="الصفحة ${n}" aria-current="${n===cfg.page?'page':'false'}">${n}</button>`};
  pager.innerHTML=`<span class="customer-page-summary">عرض ${from}–${to} من ${total}</span><div class="customer-page-buttons"><button type="button" data-page="${cfg.page-1}" ${cfg.page===1?'disabled':''}>السابق</button>${numbers.map(numbered).join('')}<button type="button" data-page="${cfg.page+1}" ${cfg.page===pages?'disabled':''}>التالي</button></div>`;
  pager.querySelectorAll('button[data-page]').forEach(button=>button.addEventListener('click',()=>{const next=Number(button.dataset.page);if(!Number.isInteger(next)||next<1||next>pages||next===cfg.page)return;cfg.page=next;paint(key);cfg.onPageChange?.(next);container.closest('.panel-card,.modal-content')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'})}));
}
function mount(key,options){
  const previous=state.get(key)||{};
  state.set(key,{...previous,...options,page:options.reset?1:(previous.page||1),pageSize:Math.max(1,Number(options.pageSize)||8)});
  paint(key);
}
window.KintoCustomerPagination={mount,refresh:paint};
})();
