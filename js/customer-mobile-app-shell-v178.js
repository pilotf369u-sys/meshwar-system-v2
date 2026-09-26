(()=>{'use strict';
const $=(s,r=document)=>r.querySelector(s);
let nav;
const counterObservers=[];
function setActive(el){
 if(!nav||!el)return;
 nav.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('is-active',x===el));
}
function clickTab(el){
 const id=el?.dataset.tab;
 if(!id)return;
 setActive(el);
 const source=$(`.tabs-nav [data-tab="${id}"]`);
 if(source)source.click();
 requestAnimationFrame(sync);
}
function badge(id){const el=document.getElementById(id),n=parseInt(el?.textContent||'0',10)||0;return n>0?n:0}
function sync(){
 if(!nav)return;
 const active=$('.tabs-nav .tab-btn.active')?.dataset.tab||'';
 if(active)nav.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('is-active',x.dataset.tab===active));
 const cart=badge('kintoLocalCartCount'),chat=badge('chatUnreadBadge');
 const cartBadge=$('[data-badge="cart"]',nav),chatBadge=$('[data-badge="chat"]',nav);
 [[cartBadge,cart],[chatBadge,chat]].forEach(([el,n])=>{if(!el)return;el.textContent=n>99?'99+':String(n);el.classList.toggle('is-visible',n>0)})
}
function observeCounter(id){
 const el=document.getElementById(id);
 if(!el)return;
 const observer=new MutationObserver(sync);
 observer.observe(el,{childList:true,characterData:true,subtree:true});
 counterObservers.push(observer);
}
function enableOrderCardOpen(){
 document.addEventListener('click',event=>{
  if(!matchMedia('(max-width:1024px)').matches)return;
  const row=event.target.closest('#activeOrdersTableBody tr,#historyOrdersTableBody tr');
  if(!row||event.target.closest('button,a,input,select,textarea,label,.decision-box'))return;
  const details=row.querySelector('.btn-details');
  details?.click();
 });
}
function build(){
 if($('#kintoMobileAppNav'))return;
 nav=document.createElement('nav');nav.id='kintoMobileAppNav';nav.className='kinto-mobile-app-nav';nav.setAttribute('aria-label','التنقل السريع للعميل');
 nav.innerHTML=`<a href="index.html" aria-label="الرئيسية"><i class="fa-solid fa-house"></i><span>الرئيسية</span></a>
 <button type="button" data-stores aria-label="المتاجر"><i class="fa-solid fa-store"></i><span>المتاجر</span></button>
 <button type="button" class="kinto-mobile-cart" data-tab="drafts" aria-label="السلة"><i class="fa-solid fa-cart-shopping"></i><span>السلة</span><b class="kinto-mobile-badge" data-badge="cart"></b></button>
 <button type="button" data-tab="chatHelp" aria-label="الدردشة"><i class="fa-solid fa-comments"></i><span>الدردشة</span><b class="kinto-mobile-badge" data-badge="chat"></b></button>
 <button type="button" data-tab="customerFavorites" aria-label="مفضلاتي"><i class="fa-solid fa-heart"></i><span>مفضلاتي</span></button>
 <button type="button" data-account aria-label="حسابي"><i class="fa-solid fa-user"></i><span>حسابي</span></button>`;
 document.body.appendChild(nav);
 const storesMenu=document.createElement('div');storesMenu.className='kinto-mobile-stores-menu';storesMenu.innerHTML='<a href="local-stores.html"><i class="fa-solid fa-store"></i><span>المتاجر المحلية</span></a><a href="global-stores.html"><i class="fa-solid fa-earth-americas"></i><span>المتاجر العالمية</span></a>';document.body.appendChild(storesMenu);
 $('[data-stores]',nav)?.addEventListener('click',()=>storesMenu.classList.toggle('is-open'));
 document.addEventListener('click',e=>{if(!storesMenu.contains(e.target)&&!$('[data-stores]',nav)?.contains(e.target))storesMenu.classList.remove('is-open')});
 nav.querySelectorAll('[data-tab]').forEach(x=>x.addEventListener('click',()=>clickTab(x)));
 $('[data-account]',nav)?.addEventListener('click',()=>window.KintoCustomerNavigationV156?.open?.());
 ['kintoLocalCartCount','chatUnreadBadge','notificationUnreadBadge'].forEach(observeCounter);
 window.addEventListener('kinto:local-cart-change',sync);
 enableOrderCardOpen();
 document.querySelector('.tabs-nav')?.addEventListener('click',()=>requestAnimationFrame(sync));
 sync();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',build,{once:true});else build();
window.KintoCustomerMobileAppV178={sync};
})();