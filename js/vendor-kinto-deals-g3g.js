/* G3G: vendor-only read-only campaign review; no submission/publishing. */
(()=>{
'use strict';
const token=()=>{try{return JSON.parse(sessionStorage.getItem('meshwar_vendor_session_v95')||'null')?.token||''}catch{return''}};
const names={pending_review:'قيد المراجعة',rejected:'مرفوضة',approved_scheduled:'تمت الموافقة — مجدولة',approved_not_published:'تمت الموافقة — بانتظار النشر',active:'نشطة',paused:'متوقفة مؤقتاً',expired:'منتهية'};
let seq=0;
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
  status.textContent=rows.length?'الحالات من الخادم؛ الموافقة لا تعني النشر قبل تفعيل الحملات.':'لا توجد حملات مقدمة للمراجعة بعد.';
  for(const row of rows){
   const card=document.createElement('article');card.className='rounded-xl border border-white/10 bg-white/5 p-3';
   const title=document.createElement('h3');title.className='font-black';title.textContent=row.title_snapshot||'حملة';
   const state=document.createElement('p');state.className='text-sm text-amber-300 mt-1';state.textContent=names[row.display_state]||'حالة غير معروفة';
   const date=document.createElement('p');date.className='text-xs text-slate-400 mt-1';date.textContent='نسخة '+row.revision+' | الإرسال: '+new Date(row.submitted_at).toLocaleString('ar-IQ');
   card.append(title,state,date);
   if(row.display_state==='rejected'){const reason=document.createElement('p');reason.className='text-sm mt-2';reason.textContent='سبب الرفض: '+(row.rejection_reason||'غير متوفر');card.append(reason)}
   items.append(card);
  }
 }catch(e){if(current===seq)status.textContent='تعذر تحميل حالة الحملات: '+e.message}
}
document.addEventListener('DOMContentLoaded',()=>{const host=document.getElementById('kintoDealsVendorG3g');host?.querySelector('[data-refresh]')?.addEventListener('click',load);document.getElementById('vendorTabBtn-deals')?.addEventListener('click',load)});
})();
