/* V416 — additive admin notices in the EXISTING customer notification panel. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
let page=1, total=0, unread=0, pending=false, request=0, lastToken='', lastLoad=0;
function token(){try{const s=window.KintoCustomerSessionV150?.read?.();return s?.token?String(s.token):''}catch{return''}}
function badge(){
 const tab=document.querySelector('[data-tab="notifications"]');if(!tab)return;
 let b=$('kintoAdminNoticeBadgeV416');
 if(!b){b=document.createElement('span');b.id='kintoAdminNoticeBadgeV416';b.className='tab-badge';b.title='إشعارات الإدارة غير المقروءة';tab.appendChild(b)}
 b.textContent=unread?String(unread):'';b.hidden=!unread;
}
function row(n){
 const el=document.createElement('article');el.className='notification-item';
 el.style.cssText='display:block!important;visibility:visible!important;opacity:1!important;margin:8px 0;padding:10px 12px;max-width:100%;min-width:0;background:#103d31;color:#f8eed0;border:1px solid #b99b52;border-radius:12px';
 const details=document.createElement('details');details.style.cssText='display:block!important;visibility:visible!important;width:100%;color:inherit';
 const summary=document.createElement('summary');
 summary.style.cssText='display:flex!important;visibility:visible!important;cursor:pointer;align-items:center;gap:8px;min-width:0;list-style-position:inside;color:inherit';
 const title=document.createElement('strong');title.textContent=n.title||'إشعار الإدارة';
 title.style.cssText='flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px';
 const date=document.createElement('small');date.textContent=new Date(n.created_at).toLocaleDateString('en-GB');
 date.style.cssText='flex-shrink:0;font-size:10px;opacity:.75';
 const arrow=document.createElement('span');arrow.textContent='⌄';arrow.setAttribute('aria-hidden','true');
 summary.append(title,date,arrow);details.append(summary);
 const content=document.createElement('div');content.style.cssText='padding:9px 4px 3px;overflow-wrap:anywhere';
 const source=document.createElement('small');source.textContent='إدارة KINTO · '+(n.kind||'announcement');
 const body=document.createElement('div');body.textContent=n.body||'';body.style.cssText='white-space:pre-wrap;margin:7px 0;font-size:13px;line-height:1.65';
 content.append(source,body);
 if(Array.isArray(n.stores)&&n.stores.length){
  const h=document.createElement('strong');h.textContent='المتاجر المرتبطة:';content.append(h);
  const wrap=document.createElement('div');wrap.style.cssText='display:flex;flex-wrap:wrap;gap:6px;margin-top:7px';
  for(const store of n.stores){
   const chip=document.createElement('a');chip.textContent=store.name||'متجر';
   if(/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(store.id||''))){chip.href='store.html?storeId='+encodeURIComponent(String(store.id));chip.title='فتح المتجر'}else{chip.removeAttribute('href')}
   chip.style.cssText='display:inline-block;border:1px solid currentColor;border-radius:8px;padding:4px 8px;font-size:12px;max-width:100%;overflow-wrap:anywhere';
   wrap.append(chip);
  }
  content.append(wrap);
 }
 if(!n.read_at){
  const btn=document.createElement('button');btn.type='button';btn.textContent='تعليم كمقروء';btn.className='btn-details';
  btn.addEventListener('click',async()=>{
   if(!token()||btn.disabled)return;btn.disabled=true;
   try{const sb=await ensureCustomerPortalSupabase();const {error}=await sb.rpc('customer_read_admin_notice_v414',{p_session_token:token(),p_notice_id:n.id});if(error)throw error;await load(page)}
   catch(e){btn.disabled=false;console.warn('Customer admin notice read:',e)}
  });content.append(btn);
 }
 details.append(content);el.append(details);return el;
}
async function load(p=1){
 const t=token(),container=$('notificationsContainer');if(!container||pending)return;
 if(!t){const old=$('kintoAdminNoticeAreaV416');if(old)old.remove();unread=0;lastToken='';badge();return;}
 const seq=++request;pending=true;page=p;lastToken=t;lastLoad=Date.now();
 let area=$('kintoAdminNoticeAreaV416');
 if(!area){area=document.createElement('section');area.id='kintoAdminNoticeAreaV416';container.before(area)}
 area.textContent='جاري تحميل تبليغات الإدارة...';
 try{
 const sb=await ensureCustomerPortalSupabase();
 const {data,error}=await sb.rpc('customer_admin_notices_v420',{p_session_token:t,p_page:p,p_page_size:8});
 if(error)throw error;if(seq!==request)return;
 total=Number(data?.total||0);unread=Number(data?.unread||0);badge();
 area.textContent='';
 if(total){
 const h=document.createElement('h3');h.textContent='تبليغات إدارة KINTO';area.append(h);
 const items=Array.isArray(data?.items)?data.items:[];
 if(!items.length){const warning=document.createElement('p');warning.textContent='عدد الإشعارات موجود لكن تفاصيلها لم تصل؛ يرجى تحديث الصفحة أو إبلاغ الدعم.';area.append(warning);console.warn('Customer notice feed count/items mismatch',{total,page:p})}
 for(const n of items)area.append(row(n));
 const nav=document.createElement('nav');nav.className='customer-pagination';
 const prev=document.createElement('button');prev.type='button';prev.textContent='السابق';prev.disabled=p<=1;prev.onclick=()=>load(p-1);
 const count=document.createElement('span');count.textContent=' '+p+' / '+Math.max(1,Math.ceil(total/8))+' ';
 const next=document.createElement('button');next.type='button';next.textContent='التالي';next.disabled=p*8>=total;next.onclick=()=>load(p+1);
 nav.append(prev,count,next);area.append(nav);
 }
 }catch(e){area.textContent='تعذر تحميل تبليغات الإدارة حالياً: '+String(e?.message||'خطأ اتصال');console.warn('Customer admin notices:',e)}
 finally{pending=false}
}
function init(){
 const panel=$('notifications');if(!panel)return;
 // Mount outside #notificationsContainer: renderCloudNotifications clears its innerHTML.
 // This preserves both independent feeds without a mutation race.
 if(!$('notificationsContainer'))return;
 document.addEventListener('click',e=>{if(e.target.closest('[data-tab="notifications"]'))setTimeout(()=>load(1),150)});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)load(page)});
 // Customer session may be established asynchronously after DOMContentLoaded.
 load(1);
 let attempts=0;
 const bootstrap=setInterval(()=>{
  if(!document.body.isConnected||attempts++>=30){clearInterval(bootstrap);return}
  const t=token();
  if(t&&(!lastToken||lastToken!==t)){clearInterval(bootstrap);load(1)}
 },1000);
 setInterval(()=>{
  if(document.hidden)return;
  const t=token();
  if(t!==lastToken){load(1);return}
  if(t&&Date.now()-lastLoad>60000)load(page);
 },15000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();