/* KINTO V123 — reserve live regions and render first-load skeletons without touching business logic. */
(()=>{'use strict';
const root=document.documentElement,loading=/^(?:جاري (?:التحميل|تحميل|تجهيز)|يتم التحميل|loading\b)/i;
root.classList.add('kinto-stability');
const hostFor=node=>node.closest?.('.table-wrap,.orders,#ordersGrid,.notifications-list,.panel-card,.card,.delivery-main')||node.parentElement;
function release(host){if(!host)return;requestAnimationFrame(()=>requestAnimationFrame(()=>{if(host.querySelector?.('.kinto-skeleton-row,.kinto-skeleton-block'))return;host.classList.remove('kinto-loading-host');host.style.removeProperty('--kinto-reserved-height')}))}
function sync(node){const el=node?.nodeType===1?node:node?.parentElement;if(!el)return;const candidates=new Set();if(el.matches?.('tr,.loading,[data-kinto-loading]'))candidates.add(el);el.querySelectorAll?.('tr,.loading,[data-kinto-loading]').forEach(x=>candidates.add(x));candidates.forEach(item=>{const isLoading=loading.test(String(item.textContent||'').trim()),isRow=item.tagName==='TR',host=hostFor(item);item.classList.toggle(isRow?'kinto-skeleton-row':'kinto-skeleton-block',isLoading);if(isLoading&&host){const height=Math.max(150,Math.ceil(host.getBoundingClientRect().height||0));host.style.setProperty('--kinto-reserved-height',height+'px');host.classList.add('kinto-loading-host')}else release(host)})}
let frame=0,pending=new Set();function schedule(node){pending.add(node);if(frame)return;frame=requestAnimationFrame(()=>{frame=0;const batch=pending;pending=new Set();batch.forEach(sync)})}
new MutationObserver(records=>records.forEach(record=>schedule(record.target))).observe(document,{subtree:true,childList:true,characterData:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>sync(document.body),{once:true});else sync(document.body);
})();

