(()=>{'use strict';
const script=document.currentScript,active=script?.dataset.active||'';
function mount(){
 if(document.getElementById('kintoMobileAppNav'))return;
 document.body.insertAdjacentHTML('beforeend',`<nav id="kintoMobileAppNav" aria-label="تنقل KINTO للجوال">
  <a href="index.html" data-key="home"><i class="fa-solid fa-house" aria-hidden="true"></i><span>الرئيسية</span></a>
  <button type="button" id="kintoMobileStores" data-key="stores" aria-label="المتاجر"><i class="fa-solid fa-store" aria-hidden="true"></i><span>المتاجر</span></button>
  <a href="dashboard.html?tab=drafts" id="kintoMobileCart"><i class="fa-solid fa-cart-shopping" aria-hidden="true"></i><span>السلة</span><b id="kintoMobileCartBadge" aria-label="عدد منتجات السلة"></b></a>
  <a href="login.html" id="kintoMobileOrders"><i class="fa-solid fa-box" aria-hidden="true"></i><span>طلباتي</span></a>
  <a href="login.html" id="kintoMobileAccount"><i class="fa-solid fa-user" aria-hidden="true"></i><span>حسابي</span></a>
 </nav><div id="kintoMobileStoresMenu" aria-label="اختيار نوع المتاجر"><a href="local-stores.html"><i class="fa-solid fa-store"></i> المتاجر المحلية</a><a href="global-stores.html"><i class="fa-solid fa-earth-americas"></i> المتاجر العالمية</a></div>`);
 const nav=document.getElementById('kintoMobileAppNav');if(active)nav?.querySelector('[data-key="'+active+'"]')?.setAttribute('data-active','true');
 const stores=document.getElementById('kintoMobileStores'),storesMenu=document.getElementById('kintoMobileStoresMenu');stores?.addEventListener('click',()=>storesMenu?.classList.toggle('open'));document.addEventListener('click',e=>{if(storesMenu&&!storesMenu.contains(e.target)&&!stores?.contains(e.target))storesMenu.classList.remove('open')});
 const sync=()=>{const id=typeof window.getStoredCustomerId==='function'?String(window.getStoredCustomerId()||'').trim():String(localStorage.getItem('meshwar_customer_id')||localStorage.getItem('viewingCustomerId')||'').trim();const orders=document.getElementById('kintoMobileOrders'),account=document.getElementById('kintoMobileAccount'),cart=document.getElementById('kintoMobileCart');if(!orders||!account||!cart)return;const dash=tab=>'dashboard.html?customerId='+encodeURIComponent(id)+'&tab='+encodeURIComponent(tab);orders.href=id?dash('activeOrders'):'login.html';account.href=id?'dashboard.html?customerId='+encodeURIComponent(id)+'&openAccount=1':'login.html';cart.href=id?dash('drafts'):'login.html';const badge=document.getElementById('kintoMobileCartBadge'),count=Number(window.KintoLocalCartV93?.getCount?.()||0);if(badge){badge.textContent=count>99?'99+':String(count);badge.classList.toggle('show',count>0)}};
 window.addEventListener('storage',sync);window.addEventListener('kinto:local-cart-change',sync);setTimeout(sync,0);setTimeout(sync,800);sync();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();