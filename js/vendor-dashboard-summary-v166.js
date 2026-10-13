/* KINTO V166: lifetime cards; authenticated, read-only, separate from current settlements. */
(()=>{
'use strict';
const ids={sales:'statSales',commission:'statCommission',paid:'statPaid',pending:'statPending',profit:'statProfit'};
let busy=false,timer,dirty=false,lastToken='';
function session(){try{return JSON.parse(sessionStorage.getItem('meshwar_vendor_session_v95')||'null')}catch{return null}}
function text(id,value){const el=document.getElementById(id);if(el&&el.textContent!==value)el.textContent=value}
function note(value){text('vendorSummaryNoteV166',value)}
function empty(){Object.values(ids).forEach(id=>text(id,'—'))}
function schedule(){dirty=true;clearTimeout(timer);timer=setTimeout(refresh,250)}
async function refresh(){
 const token=session()?.token,client=window.MeshwarVendorRuntime?.sb;
 if(!token||!client){empty();note('سجّل الدخول لعرض الملخص المالي.');return}
 if(busy)return;
 busy=true;dirty=false;
 if(token!==lastToken){empty();note('جارٍ تحميل الملخص المالي…');lastToken=token}
 try{
  const r=await client.rpc('vendor_dashboard_summary_v166',{p_session_token:token});
  if(r.error)throw Error(r.error.message||'تعذر قراءة الملخص');
  if(session()?.token!==token)return;
  if(!Array.isArray(r.data?.currencies))throw Error('استجابة الملخص غير مكتملة');
  const rows=r.data.currencies;
  for(const row of rows)for(const key of Object.keys(ids))
   if(row[key]==null||!Number.isFinite(Number(row[key])))throw Error('قيم الملخص غير مكتملة');
  const fallback=window.MeshwarVendorRuntime.getStore?.()?.default_currency||'IQD';
  for(const [key,id] of Object.entries(ids))text(id,rows.length?rows.map(x=>Number(x[key]).toLocaleString('en-US',{maximumFractionDigits:2})+' '+x.currency).join(' · '):'0 '+fallback);
  const missing=rows.reduce((n,x)=>n+Number(x.incomplete_orders||0),0),invalid=rows.reduce((n,x)=>n+Number(x.invalid_financial_orders||0),0);
  note('إجماليات الطلبات المسلّمة، تشمل الأرشيف · الربح بعد التكلفة المثبتة والمصاريف · الشحن خارج الحساب'+(missing?' · '+missing+' طلب غير مكتمل خارج حساب الربح':'')+(invalid?' · '+invalid+' طلب يحتاج مراجعة التسوية':''));
 }catch(e){if(session()?.token===token){empty();note('تعذر تحميل الملخص المالي؛ اضغط تحديث الملخص.');console.warn('KINTO summary V166:',e.message)}}
 finally{busy=false;if(dirty)schedule()}
}
function boot(){
 document.getElementById('vendorSummaryRefreshV166')?.addEventListener('click',schedule);
 for(const name of ['kinto-vendor-runtime-ready','meshwar:vendor-session-ready','meshwar:vendor-segment-adapter-ready','kinto:vendor-finance-changed'])window.addEventListener(name,schedule);
 window.addEventListener('focus',schedule);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')schedule()});
 window.addEventListener('pagehide',()=>clearTimeout(timer),{once:true});
 schedule();
}
window.KintoVendorSummaryV166={refresh};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
