/* KINTO V171 merchant visit cards */
(()=>{'use strict';
const el=id=>document.getElementById(id);
const show=(id,value)=>{const x=el(id);if(x)x.textContent=value};
let seq=0;
async function refresh(){
 const request=++seq,client=window.MeshwarVendorRuntime?.sb;
 const from=el('vendorGrowthFrom')?.value,to=el('vendorGrowthTo')?.value;
 let session;
 try{session=JSON.parse(sessionStorage.getItem('meshwar_vendor_session_v95')||'null')?.token}catch{}
 if(!client||!session||!from||!to||from>to)return;
 try{
  const response=await client.rpc('vendor_store_visits_v171',{p_session_token:session,p_from:from,p_to:to});
  if(response.error)throw response.error;
  if(request!==seq)return;
  const data=response.data;
  if(!data||!['visits','unique_browsers','ad_visits'].every(k=>Number.isSafeInteger(Number(data[k]))&&Number(data[k])>=0))throw Error('Invalid metrics');
  show('vendorVisitsTotalV171',Number(data.visits).toLocaleString('en-US'));
  show('vendorVisitsUniqueV171',Number(data.unique_browsers).toLocaleString('en-US'));
  show('vendorVisitsAdsV171',Number(data.ad_visits).toLocaleString('en-US'));
  show('vendorVisitsConversionV171','—');
  show('vendorVisitsNoteV171','الزيارات منذ التفعيل. الزوار الفريدون تقدير، وزيارات الإعلانات تعتمد على UTM. لا يمكن حساب تحويل دقيق دون ربط موثوق بين الزيارة والطلب.');
 }catch(error){
  if(request!==seq)return;
  for(const id of ['vendorVisitsTotalV171','vendorVisitsUniqueV171','vendorVisitsAdsV171','vendorVisitsConversionV171'])show(id,'—');
  show('vendorVisitsNoteV171','مؤشرات الزيارات غير متاحة. تحقق من تطبيق SQL V171.');
 }
}
function init(){
 el('vendorGrowthForm')?.addEventListener('submit',()=>setTimeout(refresh,0));
 window.addEventListener('meshwar:vendor-session-ready',()=>{seq++});
 window.KintoVendorVisitsV171={refresh};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();