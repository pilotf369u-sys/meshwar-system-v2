/* KINTO V148 — favorites entry across primary customer-facing headers. */
(()=>{'use strict';
try{sessionStorage.setItem('kinto_customer_public_refresh_route',location.pathname+location.search+location.hash);sessionStorage.setItem('kinto_customer_public_refresh_time',String(Date.now()))}catch{}
function customerId(){let id=String(localStorage.getItem('meshwar_customer_id')||localStorage.getItem('viewingCustomerId')||'').trim();try{const x=JSON.parse(localStorage.getItem('loggedInUser')||'{}');id=id||String(x?.id||'').trim()}catch{}return id}
function mount(){if(document.getElementById('kintoGlobalFavoritesLink'))return;const id=customerId();if(!id)return;const container=document.querySelector('#kintoHomeHeader .user-auth-zone,.top .header-actions');if(!container)return;const link=document.createElement('a');link.id='kintoGlobalFavoritesLink';link.className=container.closest('#kintoHomeHeader')?'header-action kinto-global-favorites':'header-action kinto-global-favorites';link.href=`dashboard.html?customerId=${encodeURIComponent(id)}&tab=favorites`;link.innerHTML='<i class="fa-solid fa-heart" aria-hidden="true"></i><span class="action-label">مفضلاتي</span>';const account=container.querySelector('#authLink,#kintoHeaderAccount');account?.insertAdjacentElement('beforebegin',link)||container.prepend(link)}
function load(src,key){if(document.querySelector(`script[data-${key}]`))return;const script=document.createElement('script');script.src=src;script.defer=true;script.dataset[key.replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]='true';document.head.appendChild(script)}
const page=(location.pathname.split('/').pop()||'index.html').toLowerCase();
if(page==='local-stores.html'||page==='global-stores.html')load('js/kinto-shared-public-header-v164.js?v=20260915-v164','kinto-shared-public-header');
else load('js/kinto-registration-country-phone-v163.js?v=20260915-v164-drawer-front','kinto-country-registration');
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
