/* KINTO V165 — read-only public counter bridge. Mirrors existing UI/state only; no DB/RPC writes. */
(()=>{'use strict';
if(window.__KINTO_PUBLIC_COUNTERS_V165__)return;window.__KINTO_PUBLIC_COUNTERS_V165__=true;
const STYLE_ID='kintoPublicCountersV165Style';
if(!document.getElementById(STYLE_ID)){const s=document.createElement('style');s.id=STYLE_ID;s.textContent=`.kinto-passive-count{position:absolute;top:-7px;left:-7px;min-width:19px;height:19px;padding:0 5px;border-radius:999px;display:none;align-items:center;justify-content:center;background:#dc2626;color:#fff;border:2px solid #063b31;font-size:10px;font-weight:950;line-height:1;box-shadow:0 3px 10px rgba(0,0,0,.28);z-index:3}.kinto-passive-count.show{display:inline-flex}.kinto-public-notifications,.kinto-public-item,.kinto-global-favorites,#kintoLocalCartTrigger{position:relative}`;document.head.appendChild(s)}
const number=v=>Math.max(0,Number.parseInt(String(v??'0').replace(/[^0-9]/g,''),10)||0);
function badge(el,key){if(!el)return null;let b=el.querySelector(`.kinto-passive-count[data-counter="${key}"]`);if(!b){b=document.createElement('b');b.className='kinto-passive-count';b.dataset.counter=key;b.setAttribute('aria-hidden','true');el.appendChild(b)}return b}
function paint(selector,key,value){const n=number(value),text=n>99?'99+':String(n);document.querySelectorAll(selector).forEach(el=>{const b=badge(el,key);if(!b)return;if(b.textContent!==text)b.textContent=text;b.classList.toggle('show',n>0);if(el.getAttribute(`data-${key}-count`)!==String(n))el.setAttribute(`data-${key}-count`,String(n))})}
function cartCount(){const api=window.KintoLocalCartV93;try{if(api?.getItems){return api.getItems().reduce((sum,row)=>sum+Math.max(1,Number(row?.quantity)||1),0)}}catch{}return number(document.getElementById('kintoLocalCartCount')?.textContent)}
function syncCart(){paint('#kintoLocalCartTrigger,[data-kinto-cart-link],.kinto-public-item[href*="tab=cart"]','cart',cartCount())}
let favoriteCount=0;
function syncFavorites(value){if(value!==undefined)favoriteCount=number(value);else{const source=document.getElementById('kintoFavoritesBadge')||document.getElementById('kintoFavoritesCount');if(source)favoriteCount=number(source.textContent)}paint('#kintoGlobalFavoritesLink,.kinto-public-item[href*="tab=favorites"],.kinto-favorites-open','favorites',favoriteCount)}
let notificationCount=0;
function syncNotifications(value){if(value!==undefined)notificationCount=number(value);else{const source=document.getElementById('notificationUnreadBadge');if(source)notificationCount=number(source.textContent)}paint('.kinto-public-notifications,.kinto-public-item[href*="tab=notifications"]','notifications',notificationCount)}
window.addEventListener('kinto:local-cart-change',syncCart);
window.addEventListener('kinto:cloud-favorites-ready',event=>syncFavorites(event.detail?.productIds?.length||0));
window.addEventListener('kinto:customer-notification-count',event=>syncNotifications(event.detail?.count||0));
function syncAll(){syncCart();syncFavorites();syncNotifications()}
function start(){syncAll();setTimeout(syncAll,500);setInterval(syncAll,2000)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
