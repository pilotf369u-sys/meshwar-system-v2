/* KINTO V167 — vendor-scoped delivered-order growth; no visitor tracking. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const readSession=()=>{try{return JSON.parse(sessionStorage.getItem('meshwar_vendor_session_v95')||'null')?.token||''}catch{return ''}};
const show=(id,value)=>{const el=$(id);if(el)el.textContent=value};
const fmt=(v,currency)=>Number(v).toLocaleString('en-US',{maximumFractionDigits:2})+' '+currency;
let seq=0;
async function refresh(){
 const token=readSession(),client=window.MeshwarVendorRuntime?.sb;
 const from=$('vendorGrowthFrom')?.value,to=$('vendorGrowthTo')?.value;
 const request=++seq;
 if(!token||!client){show('vendorGrowthStatus','سجّل الدخول لعرض أداء متجرك.');return}
 if(!from||!to||from>to){show('vendorGrowthStatus','حدد تاريخ بداية ونهاية صحيحين.');return}
 const days=Math.round((Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000);
 if(!Number.isFinite(days)||days>365){show('vendorGrowthStatus','الحد الأقصى للفترة 366 يوماً.');return}
 show('vendorGrowthStatus','جارٍ تحميل بيانات الطلبات المسلّمة…');
 for(const id of ['vendorGrowthSales','vendorGrowthProfit','vendorGrowthOrders'])show(id,'—');
 try{
  const {data,error}=await client.rpc('vendor_growth_period_v167',{p_session_token:token,p_from:from,p_to:to});
  if(error)throw error;
  if(request!==seq||readSession()!==token)return;
  if(!data||!Array.isArray(data.currencies)||data.basis!=='delivered_v161_orders_only')throw Error('Invalid growth response');
  const rows=data.currencies;
  for(const r of rows)if(!r.currency||!['sales','profit','delivered_orders','profit_ready_orders','invalid_financial_orders'].every(k=>Number.isFinite(Number(r[k]))))throw Error('Invalid growth values');
  const fallback=window.MeshwarVendorRuntime.getStore?.()?.default_currency||'IQD';
  show('vendorGrowthSales',rows.length?rows.map(r=>fmt(r.sales,r.currency)).join(' · '):'0 '+fallback);
  show('vendorGrowthProfit',rows.length?rows.map(r=>fmt(r.profit,r.currency)).join(' · '):'0 '+fallback);
  show('vendorGrowthOrders',rows.reduce((sum,r)=>sum+Number(r.delivered_orders),0).toLocaleString('en-US'));
  const incomplete=rows.reduce((sum,r)=>sum+Number(r.delivered_orders)-Number(r.profit_ready_orders),0);
  const invalid=rows.reduce((sum,r)=>sum+Number(r.invalid_financial_orders),0);
  show('vendorGrowthStatus','البيانات من الطلبات المسلّمة وفق تاريخ إنشاء الطلب (توقيت إسطنبول)، وليست تاريخ التسليم. الربح للطلبات ذات التكلفة المثبتة فقط؛ الشحن خارج الحساب.'+(incomplete?' · '+incomplete+' طلب خارج حساب الربح':'')+(invalid?' · '+invalid+' طلب يحتاج مراجعة مالية':''));
 }catch(e){if(request===seq&&readSession()===token){show('vendorGrowthStatus','تعذر تحميل البيانات؛ تحقق من تطبيق SQL V167 ثم أعد المحاولة.');console.warn('KINTO V167 growth:',e.message)}}
}
function init(){
 const today=new Date(),to=today.toISOString().slice(0,10),from=new Date(today.getTime()-29*86400000).toISOString().slice(0,10);
 if($('vendorGrowthFrom')&&!$('vendorGrowthFrom').value)$('vendorGrowthFrom').value=from;
 if($('vendorGrowthTo')&&!$('vendorGrowthTo').value)$('vendorGrowthTo').value=to;
 $('vendorGrowthForm')?.addEventListener('submit',e=>{e.preventDefault();refresh()});
 window.KintoVendorGrowthV167={refresh};
 window.addEventListener('meshwar:vendor-session-ready',()=>{seq++;});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();