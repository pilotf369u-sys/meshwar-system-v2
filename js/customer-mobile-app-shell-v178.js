(()=>{'use strict';
const $=(s,r=document)=>r.querySelector(s);
let nav,observer;
function clickTab(id){const source=$(`.tabs-nav [data-tab="${id}"]`);if(source)source.click()}
function badge(id){const el=document.getElementById(id),n=parseInt(el?.textContent||'0',10)||0;return n>0?n:0}
function sync(){
 if(!nav)return;
 const active=$('.tabs-nav .tab-btn.active')?.dataset.tab||'';
 nav.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('is-active',x.dataset.tab===active));
 const cart=badge('kintoLocalCartCount'),chat=badge('chatUnreadBadge'),notifications=badge('notificationUnreadBadge');
 const cartBadge=$('[data-badge="cart"]',nav),accountBadge=$('[data-badge="account"]',nav),accountCount=chat+notifications;
 [[cartBadge,cart],[accountBadge,accountCount]].forEach(([el,n])=>{if(!el)return;el.textContent=n>99?'99+':String(n);el.classList.toggle('is-visible',n>0)})
}
function build(){
 if($('#kintoMobileAppNav'))return;
 nav=document.createElement('nav');nav.id='kintoMobileAppNav';nav.className='kinto-mobile-app-nav';nav.setAttribute('aria-label','التنقل السريع للعميل');
 nav.innerHTML=`<a href="index.html" aria-label="الرئيسية"><i class="fa-solid fa-house"></i><span>الرئيسية</span></a>
 <a href="local-stores.html" aria-label="المتاجر"><i class="fa-solid fa-store"></i><span>المتاجر</span></a>
 <button type="button" class="kinto-mobile-cart" data-tab="drafts" aria-label="السلة"><i class="fa-solid fa-cart-shopping"></i><span>السلة</span><b class="kinto-mobile-badge" data-badge="cart"></b></button>
 <button type="button" data-tab="activeOrders" aria-label="طلباتي"><i class="fa-solid fa-box"></i><span>طلباتي</span></button>
 <button type="button" data-account aria-label="حسابي"><i class="fa-solid fa-user"></i><span>حسابي</span><b class="kinto-mobile-badge" data-badge="account"></b></button>`;
 document.body.appendChild(nav);
 nav.querySelectorAll('[data-tab]').forEach(x=>x.addEventListener('click',()=>clickTab(x.dataset.tab)));
 $('[data-account]',nav)?.addEventListener('click',()=>window.KintoCustomerNavigationV156?.open?.());
 observer=new MutationObserver(()=>requestAnimationFrame(sync));
 observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class']});
 sync()
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',build,{once:true});else build();
window.KintoCustomerMobileAppV178={sync};
})();