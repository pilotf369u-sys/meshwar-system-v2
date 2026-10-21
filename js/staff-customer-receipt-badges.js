/* Receipt badges only: never replace rows, warnings, gifts, or editable fields. */
(()=>{
'use strict';
const role=document.currentScript?.dataset.receiptRole;
const config={employee:['KintoEmployeeSessionV143',()=>ensureEmployeeSupabase()],admin:['KintoAdminSessionV147',()=>ensureCustomerSupabase()],branch:['KintoBranchSessionV148',()=>getSb()]}[role];
if(!config)return;
const selector='[data-customer-receipt-order]';
let busy=false,timer,stamp='',last=0,sessionToken='',cached=new Set(),retryAt=0;
const token=()=>String(window[config[0]]?.read?.()?.token||'');
function draw(slot,confirmed){
 if(!confirmed){if(slot.childNodes.length)slot.replaceChildren();return;}
 if(slot.querySelector('.customer-receipt-confirmed'))return;
 const badge=document.createElement('span');
 badge.className='customer-receipt-confirmed';badge.textContent='✓ أكّد العميل الاستلام';
 badge.title='أكّد العميل بنفسه استلام هذا الطلب';badge.setAttribute('aria-label',badge.title);
 badge.style.cssText='display:inline-flex;align-items:center;gap:4px;padding:3px 7px;margin-bottom:5px;border:1px solid #86c99d;border-radius:7px;background:#eaf8ef;color:#166534;font-size:11px;font-weight:900;white-space:normal';
 slot.appendChild(badge);
}
async function refresh(){
 if(busy||document.hidden)return;
 const slots=[...document.querySelectorAll(selector)],ids=[...new Set(slots.map(s=>s.dataset.customerReceiptOrder).filter(Boolean))],current=token(),key=current+'|'+ids.join(',');
 if(current!==sessionToken){slots.forEach(s=>draw(s,false));sessionToken=current;stamp='';cached=new Set();retryAt=0;}
 if(!current||!ids.length||Date.now()<retryAt)return;
 if(key===stamp&&Date.now()-last<30000){slots.forEach(s=>draw(s,cached.has(s.dataset.customerReceiptOrder)));return;}
 busy=true;
 try{
  const sb=await config[1](),confirmed=new Set();
  for(let i=0;i<ids.length;i+=100){
   const {data,error}=await sb.rpc('staff_customer_receipts_v1',{p_role:role,p_session_token:current,p_order_ids:ids.slice(i,i+100)});
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
function start(){new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});schedule();document.addEventListener('visibilitychange',schedule);setInterval(refresh,30000)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
