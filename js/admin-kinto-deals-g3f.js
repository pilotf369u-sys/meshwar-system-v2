/* KINTO DEALS G3F: isolated admin moderation panel. No storefront or checkout access. */
(()=>{
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const token=()=>window.KintoAdminSessionV147?.read()?.token||'';
let busy=false,open=false,serial=0,inbox=[],adminPage=1,adminQuery='',loaded=false,loading=false,initialRetries=0,reviewFilter='pending',historyItems=[],historyTotal=0,historyLoading=false;const adminPageSize=6;
const updateBadge=n=>{const badge=document.querySelector('.kd3f-nav-count');if(!badge)return;const count=Math.max(0,Number(n)||0);badge.textContent=String(count);badge.hidden=count===0};
async function refreshCount(){try{if(!token())return;const data=await rpc('kinto_deals_v1_admin_inbox_g3',{p_session_token:token()});updateBadge(data?.pending_count);if(open&&loaded&&!loading){const next=data?.items||[];if(JSON.stringify(next)!==JSON.stringify(inbox))await load(next)}}catch{/* Leave last confirmed count; moderation remains manual on error. */}};
const rpc=async(name,args)=>{
 const sb=await window.ensureCustomerSupabase();
 const {data,error}=await sb.rpc(name,args);
 if(error)throw error;
 return data;
};
const css=document.createElement('style');
css.textContent='.kd3f{background:#0a2f23;color:#f8f5e9;border-radius:12px;padding:16px;margin:12px 0}.kd3f h2{color:#dec17e}.kd3f button{background:#d6b66b;color:#123226;border-radius:8px;margin:5px;padding:9px}.kd3f button:disabled{opacity:.45}.kd3f textarea{width:100%;min-height:65px;background:#092b21;color:#fff;border:1px solid #8b996f;border-radius:8px;padding:8px}.kd3f .entry{border:1px solid #52735b;padding:12px;border-radius:10px;margin:12px 0}.kd3f .products{display:flex;gap:8px;flex-wrap:wrap}.kd3f .prod{width:150px;background:#153d2e;padding:8px;border-radius:8px}.kd3f .prod img{width:100%;height:90px;object-fit:contain}.kd3f .hero{height:170px;position:relative;overflow:hidden;display:grid;place-items:center}.kd3f .hero img{width:100%;height:100%;object-fit:contain;position:relative}.kd3f .hero img:first-child{position:absolute;inset:0;object-fit:cover;filter:blur(16px);opacity:.4}.kd3f .message{white-space:pre-wrap;color:#f4d28c}';
css.textContent+='.kd3f .entry{padding:10px 12px;margin:7px 0}.kd3f .entry h3{margin:0 0 5px;font-size:15px}.kd3f .entry>p{font-size:12px;margin:3px 0}.kd3f .entry>button{padding:6px 11px;margin:5px 0}.kd3f-nav-count:not([hidden]){display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;margin-inline-start:6px;padding:0 4px;border-radius:99px;background:#d6b66b;color:#102b22;font-size:12px;font-weight:800}';css.textContent+='.kd3f .kd-review-tabs button[aria-pressed="true"]{background:#f1d48d;color:#092b21;outline:2px solid #f1d48d}.kd3f .kd-search{width:100%;min-height:40px;padding:9px;border:1px solid #52735b;border-radius:8px;background:#092b21;color:#fff}.kd3f .kd-pager{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:12px}';document.head.append(css);
function el(tag,textValue){const x=document.createElement(tag);if(textValue!==undefined)x.textContent=String(textValue);return x}
function detailCard(parent,d,readOnly=false){
 const detail=el('div');detail.className='entry';
 detail.append(el('h3',d.title),el('p','المتجر: '+(d.store_name||'—')+' | النوع: '+d.kind+' | المراجعة: '+d.revision),
 el('p','من '+new Date(d.starts_at).toLocaleString('ar-IQ')+' إلى '+new Date(d.ends_at).toLocaleString('ar-IQ')),
 el('p','الحد الكلي: '+(d.max_total_redemptions??'غير محدد')+' | للعميل: '+d.max_uses_per_customer+' | المطلوب: '+(d.threshold_units??'لا ينطبق')));
 if(d.campaign_image_url){const hero=el('div');hero.className='hero';for(let i=0;i<2;i++){let im=el('img');im.src=d.campaign_image_url;im.alt=i?'صورة الحملة':'';hero.append(im)}detail.append(hero)}
 else detail.append(el('p','صورة الحملة غير متاحة بعد؛ مخزن وسائط الحملات لم يُفعّل.'));
 const products=el('div');products.className='products';
 for(const p of d.products||[]){const x=el('div');x.className='prod';if(p.image_url){const im=el('img');im.src=p.image_url;im.alt='صورة المنتج';im.loading='lazy';x.append(im)}x.append(el('div',p.name),el('small','باركود: '+(p.barcode||'—')));products.append(x)}
 detail.append(el('h4','المنتجات المؤهلة'),products);
 if(d.gift){const g=el('p','الهدية: '+d.gift.name+' | باركود: '+(d.gift.barcode||'—'));detail.append(g);if(d.gift.image_url){let im=el('img');im.src=d.gift.image_url;im.alt='صورة الهدية';im.style.cssText='height:85px;max-width:130px;object-fit:contain';detail.append(im)}}
 detail.append(el('p','الوصف: '+(d.description||'—')));
 const terms=el('details');terms.append(el('summary','الشروط التفصيلية'),el('pre',JSON.stringify(d.terms_snapshot||{},null,2)));terms.style.whiteSpace='pre-wrap';detail.append(terms);
 if(readOnly){detail.append(el('p','القرار محفوظ في السجل — لا يمكن إعادة اتخاذ قرار المراجعة.'));parent.append(detail);if(d.review_state==='acknowledged')publicationControls(parent,d);return}
 const reason=el('textarea');reason.maxLength=1000;reason.placeholder='سبب الرفض (3 أحرف على الأقل)';detail.append(reason);
 const msg=el('div');msg.className='message';
 for(const [decision,label] of [['approved','موافقة'],['rejected','رفض']]){
 const btn=el('button',label);btn.onclick=async()=>{
 if(busy)return;
 const r=reason.value.trim();
 if(decision==='rejected'&&(r.length<3||r.length>1000)){msg.textContent='سبب الرفض مطلوب (3–1000 حرف).';return}
 if(!confirm('تأكيد '+label+' على هذه النسخة؟ لا تعني الموافقة نشر الحملة.'))return;
 busy=true;document.querySelectorAll('.kd3f button').forEach(b=>b.disabled=true);
 try{await rpc('kinto_deals_v1_admin_decide_g3',{p_session_token:token(),p_submission_id:d.submission_id,p_expected_revision:d.revision,p_decision:decision,p_rejection_reason:decision==='rejected'?r:null});msg.textContent='سُجّل القرار في الخادم؛ لا يوجد نشر أو بث تلقائي.';await load()}
 catch(e){msg.textContent='لم يُحفظ القرار: '+e.message}
 finally{busy=false;document.querySelectorAll('.kd3f button').forEach(b=>b.disabled=false)}
 };detail.append(btn)
 }
 detail.append(msg);parent.append(detail)
}
async function publicationControls(parent,d){
 const section=el('div');section.className='kd-g9-publication';section.append(el('h4','نشر الإعلان — مستقل عن الموافقة وعن تفعيل البيع'));
 const state=el('p','جارٍ قراءة حالة النشر من الخادم...');state.className='message';section.append(state);parent.append(section);
 const campaignId=d.campaign_id;
 const approved=d.review_state==='acknowledged';
 async function refresh(){
  section.querySelectorAll('button').forEach(b=>b.remove());
  try{
   const x=await rpc('kinto_deals_v1_admin_publication_status_g9',{p_session_token:token(),p_campaign_id:campaignId});
   state.textContent='حالة الحملة: '+(x.published?'منشورة':'غير منشورة')+' | عرض الإعلانات العام: '+(x.display_enabled?'مفعّل':'متوقف')+'. الموافقة وحدها لا تنشر.';
   const action=x.published?'unpublish':'publish';
   if(!x.published&&!approved){state.textContent+=' النشر متاح للحملة المعتمدة فقط.';return}
   const btn=el('button',x.published?'إيقاف نشر هذا الإعلان':'نشر هذا الإعلان');btn.type='button';
   btn.onclick=async()=>{
    if(busy||!confirm(x.published?'إيقاف نشر هذا الإعلان؟':'نشر هذه الحملة المعتمدة؟ يتحقق الخادم مجدداً من الشروط والمدة.'))return;
    busy=true;btn.disabled=true;
    try{await rpc('kinto_deals_v1_admin_publication_g8',{p_session_token:token(),p_campaign_id:campaignId,p_action:action});await refresh()}
    catch(e){state.textContent='لم يتغير النشر: '+e.message;btn.disabled=false}
    finally{busy=false}
   };section.append(btn);
  }catch(e){state.textContent='تعذر قراءة حالة النشر؛ أزرار النشر معطلة: '+e.message}
 }
 await refresh();
}
async function displayControls(parent){
 const area=el('div');area.className='kd-g9-global';const label=el('p','جارٍ التحقق من بوابة عرض الإعلانات...');area.append(label);parent.append(area);
 async function refresh(){
  area.querySelectorAll('button').forEach(b=>b.remove());
  try{
   const x=await rpc('kinto_deals_v1_admin_publication_status_g9',{p_session_token:token(),p_campaign_id:null});
   label.textContent='بوابة ظهور إعلانات التجار للعملاء: '+(x.display_enabled?'مفعّلة':'مغلقة')+' (مستقلة عن تشغيل البيع).';
   const action=x.display_enabled?'disable_display':'enable_display';
   const btn=el('button',x.display_enabled?'إيقاف عرض جميع الإعلانات':'تفعيل عرض الإعلانات المنشورة');btn.type='button';
   btn.onclick=async()=>{
    if(busy||!confirm(x.display_enabled?'إخفاء جميع إعلانات الحملات عن العملاء؟':'إظهار الحملات المنشورة والمؤهلة للعملاء؟ لا يفعّل محرك البيع.'))return;
    busy=true;btn.disabled=true;
    try{await rpc('kinto_deals_v1_admin_publication_g8',{p_session_token:token(),p_campaign_id:null,p_action:action});await refresh()}
    catch(e){label.textContent='لم يتغير إعداد العرض: '+e.message;btn.disabled=false}
    finally{busy=false}
   };area.append(btn);
  }catch(e){label.textContent='تعذر قراءة بوابة العرض؛ التحكم معطل: '+e.message}
 }
 await refresh();
}
function renderInbox(){const panel=document.getElementById('kintoDealsG3f');if(!panel)return;const box=panel.querySelector('.kd-items');box.replaceChildren();const source=reviewFilter==='pending'?inbox:historyItems;const matches=source.filter(item=>[item.title_snapshot,item.store_name,item.store_name_snapshot].some(x=>String(x||'').toLocaleLowerCase().includes(adminQuery.toLocaleLowerCase())));const pages=Math.max(1,Math.ceil(matches.length/adminPageSize));adminPage=Math.min(adminPage,pages);const pager=panel.querySelector('.kd-pagination');pager.replaceChildren();pager.append(el('span','النتائج: '+matches.length+' | الصفحة '+adminPage+' من '+pages));for(const [label,delta] of [['السابق',-1],['التالي',1]]){const b=el('button',label);b.disabled=adminPage+delta<1||adminPage+delta>pages;b.onclick=()=>{adminPage+=delta;renderInbox()};pager.append(b)}if(!matches.length)box.append(el('p','لا توجد حملات تطابق البحث.'));
 for(const item of matches.slice((adminPage-1)*adminPageSize,adminPage*adminPageSize)){
 const entry=el('div');entry.className='entry';entry.append(el('h3',item.title_snapshot),el('p',(item.store_name||item.store_name_snapshot?'المتجر: '+(item.store_name||item.store_name_snapshot)+' | ':'')+'رقم النسخة: '+item.revision+' | أُرسل: '+new Date(item.submitted_at).toLocaleString('ar-IQ')));
 const btn=el('button','عرض التفاصيل');btn.onclick=async()=>{if(busy)return;btn.disabled=true;try{const d=await rpc('kinto_deals_v1_admin_detail_g3',{p_session_token:token(),p_submission_id:item.submission_id});entry.replaceChildren();entry.dataset.detailOpen='true';const close=el('button','إغلاق التفاصيل والعودة للقائمة');close.type='button';close.setAttribute('aria-label','إغلاق تفاصيل الحملة والعودة إلى قائمة المراجعة');close.onclick=()=>{delete entry.dataset.detailOpen;renderInbox()};entry.append(close);detailCard(entry,d,item.review_state!=='pending')}catch(e){panel.querySelector('.kd-status').textContent='تعذر جلب التفاصيل: '+e.message;btn.disabled=false}};entry.append(btn);box.append(entry)
 }
}
async function loadHistory(){
 if(historyLoading||!open||!token())return;historyLoading=true;
 const panel=document.getElementById('kintoDealsG3f'),status=panel.querySelector('.kd-status');
 try{const data=await rpc('kinto_deals_v1_admin_review_history_g6',{p_session_token:token(),p_state:reviewFilter,p_limit:100});
 historyItems=data.items||[];historyTotal=data.total_count||0;
 if(reviewFilter!=='pending'&&!panel.querySelector('[data-detail-open="true"]'))renderInbox();
 status.textContent='سجل الحملات: '+historyTotal+' نتيجة. عرض فقط للحملات التي صدر قرار بشأنها.';
 }catch(e){status.textContent='تعذر تحميل سجل الحالات: '+e.message+' — تأكد من تطبيق SQL الخاص بـ G6.'}
 finally{historyLoading=false}
}
async function load(prefetchedItems){
 const panel=document.getElementById('kintoDealsG3f');if(!panel||!open||loading)return;
 loading=true;const id=++serial,box=panel.querySelector('.kd-items'),status=panel.querySelector('.kd-status');
 if(!loaded)status.textContent='جاري تحميل الطلبات المحمية...';
 try{
 if(!token())throw Error('جلسة الأدمن غير متاحة. سجّل الدخول من جديد.');
 const data=Array.isArray(prefetchedItems)?{items:prefetchedItems,pending_count:prefetchedItems.length}:await rpc('kinto_deals_v1_admin_inbox_g3',{p_session_token:token()});
 if(id!==serial)return;
 panel.querySelector('.kd-count').textContent=data.pending_count??0;updateBadge(data.pending_count);
 status.textContent=(data.items||[]).length?'اضغط عرض التفاصيل لمراجعة المنتجات والهدية. اختر التصنيف المطلوب أعلاه، ويمكن فتح تفاصيل كل حملة.':'لا توجد حملات تنتظر المراجعة.';
 const next=data.items||[];const changed=!loaded||JSON.stringify(next)!==JSON.stringify(inbox);inbox=next;loaded=true;if(changed){adminPage=Math.min(adminPage,Math.max(1,Math.ceil(inbox.length/adminPageSize)));if(reviewFilter==='pending'&&!panel.querySelector('[data-detail-open="true"]'))renderInbox();else status.textContent='وصل تحديث جديد للحملات؛ ستتحدث القائمة بعد إغلاق التفاصيل أو الضغط على تحديث.'}
 }catch(e){if(id===serial)status.textContent='تعذر تحميل الحملات: '+e.message}
 finally{loading=false}
}
document.addEventListener('DOMContentLoaded',()=>{
 const sidebar=document.querySelector('.sidebar'),main=document.querySelector('.main-content');if(!sidebar||!main)return;
 const link=el('a','حملات التجار — المراجعة');link.href='#kintoDealsG3f';link.dataset.adminSection='kintoDealsG3f';link.addEventListener('click',e=>{
 e.preventDefault();const panel=document.getElementById('kintoDealsG3f');open=true;if(typeof window.showAdminMasterSection==='function')window.showAdminMasterSection('kintoDealsG3f');else{window.showSection('kintoDealsG3f');document.querySelectorAll('.sidebar a.active').forEach(a=>a.classList.remove('active'));link.classList.add('active')}panel.scrollIntoView({behavior:'smooth'});publicationArea.replaceChildren();displayControls(publicationArea);load();
 });const badge=el('span','');badge.className='kd3f-nav-count';badge.hidden=true;badge.setAttribute('aria-label','حملات تنتظر المراجعة');link.append(' ',badge);const logout=sidebar.querySelector('.logout-link');if(logout)sidebar.insertBefore(link,logout);else sidebar.append(link);
 const panel=el('section');panel.id='kintoDealsG3f';panel.className='card kd3f';
 panel.append(el('h2','مراجعة حملات التجار'),el('p','بانتظار المراجعة: '));
 panel.lastChild.append(Object.assign(el('strong','—'),{className:'kd-count'}));
 const publicationArea=el('div');panel.append(publicationArea);const refreshPublication=el('button','تحديث حالة نشر الإعلانات');refreshPublication.type='button';refreshPublication.onclick=()=>{publicationArea.replaceChildren();displayControls(publicationArea)};panel.append(refreshPublication);const refresh=el('button','تحديث');refresh.onclick=()=>reviewFilter==='pending'?load():loadHistory();panel.append(refresh);
 const category=el('div');category.className='kd-pager kd-review-tabs';category.setAttribute('role','group');category.setAttribute('aria-label','تصنيف الحملات');for(const [state,label] of [['all','الكل'],['pending','قيد المراجعة'],['approved','موافق عليها'],['rejected','مرفوضة']]){const b=el('button',label);b.type='button';b.dataset.reviewState=state;b.setAttribute('aria-pressed',String(state===reviewFilter));b.onclick=()=>{reviewFilter=state;adminPage=1;category.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));if(state==='pending'){renderInbox();load()}else{historyItems=[];loadHistory()}};category.append(b)}panel.append(category);const status=el('p');status.className='kd-status';panel.append(status);
 const search=el('input');search.type='search';search.placeholder='بحث باسم الحملة أو المتجر';search.setAttribute('aria-label','بحث باسم الحملة أو المتجر');search.className='kd-search';search.addEventListener('input',()=>{adminQuery=search.value.trim();adminPage=1;renderInbox()});panel.append(search);const items=el('div');items.className='kd-items';panel.append(items);const pager=el('div');pager.className='kd-pager kd-pagination';panel.append(pager);main.append(panel);
 // The master dashboard can restore its section from sessionStorage at window.load,
 // even when the URL has no section parameter. Follow the actual active section.
 const activateIfVisible=()=>{
   const active=panel.classList.contains('active-section');
   if(!active){open=false;return}
   if(!open){open=true;if(!loaded)status.textContent='بانتظار جاهزية جلسة الأدمن لتحميل الحملات...';publicationArea.replaceChildren();if(token())displayControls(publicationArea)}
   if(!loaded&&!loading&&token())load();
 };
 const requested=new URLSearchParams(location.search).get('section');
 if(requested==='kintoDealsG3f'){open=true;status.textContent='بانتظار جاهزية جلسة الأدمن لتحميل الحملات...'}
 // Master section restoration runs on window.load, after this deferred script's DOMContentLoaded.
 window.addEventListener('load',()=>setTimeout(activateIfVisible,0));
 const activeObserver=new MutationObserver(activateIfVisible);
 activeObserver.observe(panel,{attributes:true,attributeFilter:['class']});
 activateIfVisible();
 // Admin authentication and Supabase bootstrap can finish after DOMContentLoaded on a cold refresh.
 // Retry the initial inbox only; never destroy a successfully rendered list or poll details.
 const initialLoad=setInterval(()=>{if(!open||loaded){if(loaded)clearInterval(initialLoad);return}if(++initialRetries>20){clearInterval(initialLoad);return}if(token()&&!loading)load()},1500);
 if(open&&token())load();
 refreshCount();window.addEventListener('focus',()=>{refreshCount();if(open&&!loaded&&!loading&&token())load()});document.addEventListener('visibilitychange',()=>{if(!document.hidden){refreshCount();if(open&&!loaded&&!loading&&token())load()}});
 window.setInterval(()=>{if(document.hidden||!token())return;refreshCount()},30000);
});
})();
