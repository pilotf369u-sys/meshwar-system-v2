/* Receipt badges only: never replace rows, warnings, gifts, or editable fields. */
(()=>{
'use strict';
const role=document.currentScript?.dataset.receiptRole;
const config={employee:['KintoEmployeeSessionV143',()=>ensureEmployeeSupabase()],admin:['KintoAdminSessionV147',()=>ensureCustomerSupabase()],branch:['KintoBranchSessionV148',()=>getSb()],vendor:[null,()=>window.MeshwarVendorRuntime?.sb]}[role];
if(!config)return;
const selector='[data-customer-receipt-order]';
let busy=false,timer,stamp='',last=0,sessionToken='',cached=new Set(),retryAt=0;
const token=()=>{
 if(role!=='vendor')return String(window[config[0]]?.read?.()?.token||'');
 const s=window.MeshwarVendorV94?.session?.(),store=window.MeshwarVendorRuntime?.getStore?.();
 if(!s?.token||!store?.id||(s.storeId&&String(s.storeId)!==String(store.id)))return '';
 if(s.expiresAt&&(!Number.isFinite(Date.parse(s.expiresAt))||Date.parse(s.expiresAt)<=Date.now()))return '';
 return String(s.token);
};
function discoverVendorSlots(){
 if(role!=='vendor')return;
 document.querySelectorAll('#ordersBody tr[data-vendor-order-id]').forEach(row=>{
  const cell=row.querySelector('[data-label="الحالة"]');if(!cell||cell.querySelector(selector))return;
  const slot=document.createElement('div');slot.dataset.customerReceiptOrder=row.dataset.vendorOrderId;cell.prepend(slot);
 });
}
function draw(slot,confirmed){
 if(!confirmed){if(slot.childNodes.length)slot.replaceChildren();return;}
 if(slot.querySelector('.customer-receipt-confirmed'))return;
 const badge=document.createElement('button');badge.type='button';
 badge.className='customer-receipt-confirmed';badge.textContent='✓';
 badge.title='أكّد العميل بنفسه استلام هذا الطلب';badge.setAttribute('aria-label',badge.title);
 badge.style.cssText='display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;flex:none;padding:0;border:1px solid #86c99d;border-radius:50%;background:#eaf8ef;color:#166534;font-size:18px;font-weight:900;line-height:1;cursor:pointer';
 slot.appendChild(badge);
}
function arrange(slot){
 const cell=slot.closest('td');if(!slot.parentElement)return;
 let strip=slot.closest('.kinto-order-indicators');
 if(!strip){strip=document.createElement('div');strip.className='kinto-order-indicators';slot.before(strip);strip.appendChild(slot);}
 // Move the original nodes, preserving stock-warning click handlers and gift conditions.
 const stock=cell?.querySelector('[data-stock-icon-slot],[data-admin-stock-slot],.vendor-order-icons-v66');
 if(stock&&stock.parentElement!==strip)strip.appendChild(stock);
}
function installIndicators(){
 const style=document.createElement('style');
 style.textContent='.kinto-order-indicators{display:flex;align-items:center;justify-content:flex-start;gap:4px;flex-wrap:nowrap;direction:rtl;width:max-content;max-width:100%}.kinto-order-indicators>div{flex:none;line-height:1}.kinto-order-indicators>div:empty{display:none}.kinto-order-indicators [data-stock-icon-slot] button,.kinto-order-indicators [data-stock-icon-slot] span[title],.kinto-order-indicators [data-admin-stock-slot] button,.kinto-order-indicators [data-admin-stock-slot] span[title]{font-size:18px!important;padding:2px!important;line-height:1!important}.kinto-order-indicators button:focus-visible,.kinto-order-indicators [tabindex]:focus-visible{outline:2px solid #d4af37;outline-offset:2px}';
 style.textContent+='.kinto-order-indicators>.vendor-order-icons-v66{margin:0!important;gap:2px}.kinto-order-indicators .vendor-order-icons-v66 button,.kinto-order-indicators .vendor-order-icons-v66 span[title]{font-size:18px!important;padding:2px!important;line-height:1!important}';
 document.head.appendChild(style);
 let tip;
 const close=()=>{tip?.remove();tip=null};
 function show(target){
  close();const text=target?.getAttribute('title');if(!text)return;
  tip=document.createElement('div');tip.setAttribute('role','tooltip');tip.textContent=text;
  tip.style.cssText='position:fixed;z-index:2147483646;max-width:240px;padding:8px 10px;border:1px solid #d4af37;border-radius:8px;background:#063b32;color:#fff;font:12px/1.6 Tahoma,Arial;direction:rtl;box-shadow:0 4px 14px #0004;pointer-events:none';
  document.body.appendChild(tip);const r=target.getBoundingClientRect(),b=tip.getBoundingClientRect();
  tip.style.left=Math.max(8,Math.min(r.right-b.width,window.innerWidth-b.width-8))+'px';
  tip.style.top=(r.bottom+b.height+8<window.innerHeight?r.bottom+5:Math.max(8,r.top-b.height-5))+'px';
 }
 const target=e=>{const el=e.target.closest?.('[title]');return el?.closest('.kinto-order-indicators')?el:null};
 document.addEventListener('click',e=>{const el=target(e);if(el)show(el);else close()});
 document.addEventListener('focusin',e=>{const el=target(e);if(el)show(el)});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')close();else if((e.key==='Enter'||e.key===' ')&&target(e)?.matches('span[title]')){e.preventDefault();show(target(e))}});
 window.addEventListener('scroll',close,true);
}
async function refresh(){
 if(busy||document.hidden)return;
 discoverVendorSlots();const slots=[...document.querySelectorAll(selector)];slots.forEach(arrange);const ids=[...new Set(slots.map(s=>s.dataset.customerReceiptOrder).filter(Boolean))],current=token(),key=current+'|'+ids.join(',');
 if(current!==sessionToken){slots.forEach(s=>draw(s,false));sessionToken=current;stamp='';cached=new Set();retryAt=0;}
 if(!current||!ids.length||Date.now()<retryAt)return;
 if(key===stamp&&Date.now()-last<30000){slots.forEach(s=>draw(s,cached.has(s.dataset.customerReceiptOrder)));return;}
 busy=true;
 try{
  const sb=await config[1](),confirmed=new Set();
  for(let i=0;i<ids.length;i+=100){
   const {data,error}=await sb.rpc(role==='vendor'?'vendor_customer_receipts_v1':'staff_customer_receipts_v1',{...(role==='vendor'?{}:{p_role:role}),p_session_token:current,p_order_ids:ids.slice(i,i+100)});
   if(error)throw error;
   if(!Array.isArray(data))throw Error('RECEIPT_RESPONSE_INVALID');
   data.forEach(r=>{if(r.confirmed_at)confirmed.add(String(r.order_id))});
  }
  if(token()!==current){stamp='';return;}
  // Read current elements: a filter or quiet row refresh may have replaced the original slots.
  document.querySelectorAll(selector).forEach(s=>{if(ids.includes(s.dataset.customerReceiptOrder))draw(s,confirmed.has(s.dataset.customerReceiptOrder))});
  cached=confirmed;stamp=key;last=Date.now();retryAt=0;
 }catch(error){
  document.querySelectorAll(selector).forEach(s=>draw(s,false));
  stamp='';last=Date.now();retryAt=last+30000;console.warn('Customer receipt badge verification unavailable',error);
 }finally{busy=false;schedule();}
}
function schedule(){clearTimeout(timer);timer=setTimeout(refresh,150)}
function start(){installIndicators();new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});schedule();document.addEventListener('visibilitychange',schedule);window.addEventListener('meshwar:vendor-segment-adapter-ready',schedule);setInterval(refresh,30000)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
