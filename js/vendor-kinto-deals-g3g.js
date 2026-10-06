/* G3G: vendor-only read-only campaign review; no submission/publishing. */
(()=>{
'use strict';
const token=()=>{try{return JSON.parse(sessionStorage.getItem('meshwar_vendor_session_v95')||'null')?.token||''}catch{return''}};
const names={pending_review:'قيد المراجعة',rejected:'مرفوضة',approved_scheduled:'تمت الموافقة — مجدولة',approved_not_published:'تمت الموافقة — بانتظار النشر',active:'نشطة',paused:'متوقفة مؤقتاً',expired:'منتهية'};
let seq=0,feed=[],liveCampaignIds=new Set(),page=1,filter='all',query='';const pageSize=6;
function updateCounts(){const host=document.getElementById('kintoDealsVendorG3g');if(!host)return;const count={all:feed.length,pending_review:0,approved:0,rejected:0};for(const r of feed){if(r.display_state==='pending_review')count.pending_review++;if(String(r.display_state||'').startsWith('approved'))count.approved++;if(r.display_state==='rejected')count.rejected++}for(const [key,n] of Object.entries(count)){const x=host.querySelector('[data-state-count="'+key+'"]');if(x)x.textContent=String(n)}}
function syncFilters(){const host=document.getElementById('kintoDealsVendorG3g');if(!host)return;const select=host.querySelector('[data-filter]');if(select)select.value=filter;host.querySelectorAll('[data-filter-button]').forEach(b=>{const active=b.dataset.filterButton===filter;b.setAttribute('aria-pressed',String(active));b.classList.toggle('bg-amber-400/20',active);b.classList.toggle('border-amber-300',active)})}
function renderFeed(){syncFilters();const host=document.getElementById('kintoDealsVendorG3g');if(!host)return;const items=host.querySelector('[data-items]');items.replaceChildren();const filtered=feed.filter(row=>(filter==='all'||(filter==='approved'?String(row.display_state).startsWith('approved'):row.display_state===filter))&&String(row.title_snapshot||'').toLocaleLowerCase().includes(query.toLocaleLowerCase()));const pages=Math.max(1,Math.ceil(filtered.length/pageSize));page=Math.min(page,pages);const pager=host.querySelector('[data-pager]');pager.replaceChildren();pager.append(Object.assign(document.createElement('span'),{textContent:'النتائج: '+filtered.length+' | الصفحة '+page+' من '+pages}));for(const [caption,delta] of [['السابق',-1],['التالي',1]]){const b=document.createElement('button');b.type='button';b.textContent=caption;b.disabled=page+delta<1||page+delta>pages;b.className='rounded-lg border border-amber-400/40 px-3 py-1 disabled:opacity-40';b.addEventListener('click',()=>{page+=delta;renderFeed()});pager.append(b)}if(!filtered.length){const empty=document.createElement('p');empty.textContent='لا توجد حملات تطابق البحث.';items.append(empty)}
const status=host.querySelector('[data-status]'),sb=window.MeshwarVendorRuntime?.sb;
  for(const row of filtered.slice((page-1)*pageSize,page*pageSize)){
   const card=document.createElement('article');card.className='rounded-xl border border-white/10 bg-white/5 p-3';
   const title=document.createElement('h3');title.className='font-black';title.textContent=row.title_snapshot||'حملة';
   const state=document.createElement('p');state.className='text-sm text-amber-300 mt-1';state.textContent=liveCampaignIds.has(String(row.campaign_id))?'منشورة ونشطة للعميل':(names[row.display_state]||'حالة غير معروفة');
   const date=document.createElement('p');date.className='text-xs text-slate-400 mt-1';date.textContent='نسخة '+row.revision+' | الإرسال: '+new Date(row.submitted_at).toLocaleString('ar-IQ');
   const header=document.createElement('div');header.className='flex flex-wrap items-center justify-between gap-2';header.append(title,state);card.append(header,date);
   if(row.display_state==='rejected'){const reason=document.createElement('p');reason.className='text-sm mt-2';reason.textContent='سبب الرفض: '+(row.rejection_reason||'غير متوفر');card.append(reason)}
   if(row.display_state==='rejected'){
    const revise=document.createElement('button');revise.type='button';revise.textContent='إنشاء نسخة للتعديل';revise.className='mt-3 rounded-lg border border-amber-400/50 px-3 py-2 text-xs font-bold text-amber-200';
    revise.addEventListener('click',async()=>{
     if(revise.disabled||!window.confirm('إنشاء مسودة جديدة؟ يبقى سبب الرفض محفوظاً، ولن تُرسل للإدارة تلقائياً.'))return;
     revise.disabled=true;
     try{
      const {data,error}=await sb.rpc('kinto_deals_v1_vendor_revise_rejected_g4',{p_session_token:token(),p_rejected_campaign_id:row.campaign_id});
      if(error)throw error;
      if(!data?.ok||data.status!=='draft')throw Error('تعذر تأكيد إنشاء المسودة.');
      window.dispatchEvent(new CustomEvent('kinto-deals-revision-created',{detail:{campaignId:data.campaign_id}}));
      revise.textContent='تم إنشاء نسخة ضمن المسودات';
     }catch(e){status.textContent='تعذر إنشاء النسخة: '+e.message;revise.disabled=false}
    });card.append(revise);
   }
   items.append(card);
  }
}
async function load(){
 const host=document.getElementById('kintoDealsVendorG3g');if(!host)return;
 const current=++seq,status=host.querySelector('[data-status]'),items=host.querySelector('[data-items]');
 status.textContent='جاري تحميل حالات حملات متجرك...';items.replaceChildren();
 try{
  if(!token())throw Error('جلسة التاجر الآمنة غير متاحة؛ يرجى تسجيل الدخول مجدداً.');
  const sb=window.MeshwarVendorRuntime?.sb;if(!sb)throw Error('اتصال التاجر غير جاهز.');
  const {data,error}=await sb.rpc('kinto_deals_v1_vendor_review_feed_g3',{p_session_token:token(),p_limit:50});
  if(error)throw error;if(current!==seq)return;
  host.querySelector('[data-count]').textContent=String(data?.pending_count??0);
  const rows=data?.items||[];
  status.textContent=rows.length?'البحث والصفحات ضمن السجلات المحمّلة (حتى 50 حالياً). الموافقة لا تعني النشر.':'لا توجد حملات مقدمة للمراجعة بعد.';
  feed=rows;liveCampaignIds=new Set();page=1;
  // G13 follow-up: the public feed is the authoritative published-and-live gate.
  // This only corrects the merchant-facing label; review decisions stay unchanged.
  try {
   const {data:published,error:publicError}=await sb.rpc('kinto_deals_v1_public_feed_g7',{p_store_id:null});
   if(current!==seq)return;
   if(!publicError&&Array.isArray(published)){
    const now=Date.now();
    liveCampaignIds=new Set(published.filter(r=>r.campaign_id&&new Date(r.starts_at).getTime()<=now&&new Date(r.ends_at).getTime()>now).map(r=>String(r.campaign_id)));
   }
  }catch{/* Preserve review labels if public feed cannot be read. */}
  if(current===seq){updateCounts();renderFeed();}
 }catch(e){if(current===seq)status.textContent='تعذر تحميل حالة الحملات: '+e.message}
}
document.addEventListener('DOMContentLoaded',()=>{const host=document.getElementById('kintoDealsVendorG3g');host?.querySelector('[data-refresh]')?.addEventListener('click',load);host?.querySelector('[data-search]')?.addEventListener('input',e=>{query=e.target.value.trim();page=1;renderFeed()});host?.querySelectorAll('[data-filter-button]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filterButton;page=1;renderFeed()}));host?.querySelector('[data-filter]')?.addEventListener('change',e=>{filter=e.target.value;page=1;renderFeed()});document.getElementById('vendorTabBtn-dealsHistory')?.addEventListener('click',load);window.addEventListener('kinto-deals-vendor-submitted',load);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&document.getElementById('vendorTab-dealsHistory')?.offsetParent)load()})});
})();
