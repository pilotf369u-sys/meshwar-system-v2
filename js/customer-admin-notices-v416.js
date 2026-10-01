/* V416 — additive admin notices in the EXISTING customer notification panel. */
(()=>{
'use strict';
const KEY='kinto_customer_review_session_v132';
const $=id=>document.getElementById(id);
let page=1, total=0, unread=0, pending=false, request=0;
function token(){try{const s=JSON.parse(sessionStorage.getItem(KEY)||'null');return s?.token&&s?.expiresAt&&Date.parse(s.expiresAt)>Date.now()?String(s.token):''}catch{return''}}
function badge(){
 const tab=document.querySelector('[data-tab="notifications"]');if(!tab)return;
 let b=$('kintoAdminNoticeBadgeV416');
 if(!b){b=document.createElement('span');b.id='kintoAdminNoticeBadgeV416';b.className='tab-badge';b.title='إشعارات الإدارة غير المقروءة';tab.appendChild(b)}
 b.textContent=unread?String(unread):'';b.hidden=!unread;
}
function row(n){
 const el=document.createElement('article');el.className='notification-item';el.style.marginBottom='8px';
 const title=document.createElement('b');title.textContent=n.title||'إشعار الإدارة';
 const tag=document.createElement('small');tag.textContent=' · إدارة KINTO · '+new Date(n.created_at).toLocaleString('en-GB');
 const body=document.createElement('div');body.textContent=n.body||'';body.style.whiteSpace='pre-wrap';
 el.append(title,tag,body);
 if(!n.read_at){const btn=document.createElement('button');btn.type='button';btn.textContent='تعليم كمقروء';btn.className='btn-details';btn.addEventListener('click',async()=>{
 if(!token()||btn.disabled)return;btn.disabled=true;
 try{const sb=await ensureCustomerPortalSupabase();const {error}=await sb.rpc('customer_read_admin_notice_v414',{p_session_token:token(),p_notice_id:n.id});if(error)throw error;await load(page)}
 catch(e){btn.disabled=false;console.warn('Customer admin notice read:',e)}
 });el.append(btn)}
 return el;
}
async function load(p=1){
 const t=token(),container=$('notificationsContainer');if(!t||!container||pending)return;
 const seq=++request;pending=true;page=p;
 let area=$('kintoAdminNoticeAreaV416');
 if(!area){area=document.createElement('section');area.id='kintoAdminNoticeAreaV416';container.prepend(area)}
 area.textContent='جاري تحميل تبليغات الإدارة...';
 try{
 const sb=await ensureCustomerPortalSupabase();
 const {data,error}=await sb.rpc('customer_admin_notices_v414',{p_session_token:t,p_page:p,p_page_size:8});
 if(error)throw error;if(seq!==request)return;
 total=Number(data?.total||0);unread=Number(data?.unread||0);badge();
 area.textContent='';
 if(total){
 const h=document.createElement('h3');h.textContent='تبليغات إدارة KINTO';area.append(h);
 for(const n of data.items||[])area.append(row(n));
 const nav=document.createElement('nav');nav.className='customer-pagination';
 const prev=document.createElement('button');prev.type='button';prev.textContent='السابق';prev.disabled=p<=1;prev.onclick=()=>load(p-1);
 const count=document.createElement('span');count.textContent=' '+p+' / '+Math.max(1,Math.ceil(total/8))+' ';
 const next=document.createElement('button');next.type='button';next.textContent='التالي';next.disabled=p*8>=total;next.onclick=()=>load(p+1);
 nav.append(prev,count,next);area.append(nav);
 }
 }catch(e){area.textContent='تعذر تحميل تبليغات الإدارة حالياً.';console.warn('Customer admin notices:',e)}
 finally{pending=false}
}
function init(){
 const panel=$('notifications');if(!panel)return;
 // The existing order/review renderer may replace its children: reattach additively.
 const container=$('notificationsContainer');if(!container)return;
 let scheduled=false;
 new MutationObserver(()=>{
 if(scheduled||!panel.classList.contains('active')||$('kintoAdminNoticeAreaV416'))return;
 scheduled=true;queueMicrotask(()=>{scheduled=false;if(!$('kintoAdminNoticeAreaV416'))load(page)})
 }).observe(container,{childList:true});
 document.addEventListener('click',e=>{if(e.target.closest('[data-tab="notifications"]'))setTimeout(()=>load(1),150)});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&token())load(page)});
 if(token())load(1);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();