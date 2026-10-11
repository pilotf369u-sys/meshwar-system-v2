/* KINTO V168 — authenticated daily trend and financial composition. No tracking or writes. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const session=()=>{try{return JSON.parse(sessionStorage.getItem('meshwar_vendor_session_v95')||'null')?.token||''}catch{return ''}};
const format=n=>Number(n).toLocaleString('en-US',{maximumFractionDigits:0});
const palette=['#34d399','#fbbf24','#818cf8'];
let serial=0,lastData=null;
function clearCanvas(canvas){if(!canvas)return;const ctx=canvas.getContext('2d');if(ctx)ctx.clearRect(0,0,canvas.width,canvas.height)}
function setup(canvas){const w=Math.max(280,Math.round(canvas.getBoundingClientRect().width||560)),h=220,d=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(w*d);canvas.height=Math.round(h*d);const ctx=canvas.getContext('2d');ctx.setTransform(d,0,0,d,0,0);return {ctx,w,h}}
function lineChart(days,currency){
 const canvas=$('vendorGrowthTrendV168');if(!canvas)return;
 const {ctx,w,h}=setup(canvas);ctx.clearRect(0,0,w,h);
 const left=56,right=w-18,top=22,bottom=h-34;
 const byDate=new Map(days.filter(x=>x.currency===currency).map(x=>[x.day,Number(x.sales)]));
 const from=$('vendorGrowthFrom').value,to=$('vendorGrowthTo').value;
 const dates=[];let t=Date.parse(from+'T00:00:00Z'),end=Date.parse(to+'T00:00:00Z');
 for(let i=0;t<=end&&i<366;i++,t+=86400000)dates.push(new Date(t).toISOString().slice(0,10));
 const vals=dates.map(x=>byDate.get(x)||0),max=Math.max(1,...vals);
 ctx.font='11px Arial';ctx.textAlign='right';ctx.fillStyle='#cbd5e1';ctx.strokeStyle='rgba(255,255,255,.15)';
 for(let k=0;k<=4;k++){const y=top+(bottom-top)*k/4;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();ctx.fillText(format(max*(4-k)/4),left-7,y+4)}
 if(!dates.length)return;
 ctx.strokeStyle='#34d399';ctx.lineWidth=2.5;ctx.beginPath();
 vals.forEach((v,i)=>{const x=left+(right-left)*(dates.length===1?.5:i/(dates.length-1)),y=bottom-(bottom-top)*v/max;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)});ctx.stroke();
 ctx.fillStyle='#cbd5e1';ctx.textAlign='center';ctx.fillText(dates[0].slice(5),left,bottom+19);if(dates.length>1)ctx.fillText(dates.at(-1).slice(5),right-12,bottom+19);
}
function donut(days,currency){
 const canvas=$('vendorGrowthCompositionV168');if(!canvas)return;
 const {ctx,w,h}=setup(canvas);ctx.clearRect(0,0,w,h);
 const rows=days.filter(x=>x.currency===currency);
 const vals=[rows.reduce((a,x)=>a+Number(x.net),0),rows.reduce((a,x)=>a+Number(x.commission),0),rows.reduce((a,x)=>a+Number(x.deductions),0)];
 const total=vals.reduce((a,b)=>a+b,0);
 if(vals.some(x=>x<0)||total<=0){$('vendorGrowthCompositionLegendV168').textContent='لا يوجد توزيع موجب صالح للرسم لهذه الفترة.';return}
 const cx=Math.min(w*.33,145),cy=105,r=75;let start=-Math.PI/2;
 vals.forEach((v,i)=>{if(!v)return;const end=start+v/total*2*Math.PI;ctx.beginPath();ctx.arc(cx,cy,r,start,end);ctx.arc(cx,cy,r*.54,end,start,true);ctx.closePath();ctx.fillStyle=palette[i];ctx.fill();start=end});
 ctx.fillStyle='#f8fafc';ctx.font='bold 13px Arial';ctx.textAlign='center';ctx.fillText(currency,cx,110);
 const names=['صافي المستحق للتاجر','العمولة','الخصومات الأخرى'];
 $('vendorGrowthCompositionLegendV168').textContent=names.map((n,i)=>n+': '+format(vals[i])+' '+currency).join(' · ');
}
async function refresh(){
 const token=session(),client=window.MeshwarVendorRuntime?.sb,from=$('vendorGrowthFrom')?.value,to=$('vendorGrowthTo')?.value,seq=++serial;
 if(!token||!client||!from||!to||from>to)return;
 const span=(Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000;
 if(!Number.isFinite(span)||span>365)return;
 $('vendorGrowthChartStatusV168').textContent='جارٍ تحميل الرسوم…';
 try{
  const {data,error}=await client.rpc('vendor_growth_daily_v168',{p_session_token:token,p_from:from,p_to:to});
  if(error)throw error;
  if(seq!==serial||session()!==token)return;
  if(data?.basis!=='delivered_v161_orders_by_creation_date'||!Array.isArray(data.days))throw Error('Invalid response');
  const rows=data.days;
  if(rows.some(r=>!/^\d{4}-\d{2}-\d{2}$/.test(r.day)||!r.currency||!['sales','commission','deductions','net'].every(k=>Number.isFinite(Number(r[k])))))throw Error('Invalid values');
  const currencies=[...new Set(rows.map(r=>r.currency))];
  const selected=$('vendorGrowthChartCurrencyV168');selected.replaceChildren();
  for(const currency of currencies){const option=document.createElement('option');option.value=currency;option.textContent=currency;selected.append(option)}
  if(!currencies.length){clearCanvas($('vendorGrowthTrendV168'));clearCanvas($('vendorGrowthCompositionV168'));$('vendorGrowthCompositionLegendV168').textContent='لا توجد طلبات مسلّمة في الفترة.';$('vendorGrowthChartStatusV168').textContent='لا توجد بيانات لرسمها.';return}
  lastData=rows;draw();$('vendorGrowthChartStatusV168').textContent='منحنى المبيعات حسب تاريخ إنشاء الطلب؛ الأيام بلا طلبات تظهر بصفر. الرسم الدائري يوزع المبيعات إلى مستحقات التاجر والعمولة والخصومات، وليس توزيع الأرباح.';
 }catch(e){if(seq===serial&&session()===token){$('vendorGrowthChartStatusV168').textContent='تعذر تحميل الرسوم؛ تأكد من تنفيذ SQL V168.';console.warn('KINTO V168 charts:',e.message)}}
}
function draw(){if(!lastData)return;const c=$('vendorGrowthChartCurrencyV168').value;lineChart(lastData,c);donut(lastData,c)}
function init(){
 $('vendorGrowthForm')?.addEventListener('submit',()=>{setTimeout(refresh,0)});
 $('vendorGrowthChartCurrencyV168')?.addEventListener('change',draw);
 window.addEventListener('resize',()=>{if($('vendorTab-growth')?.classList.contains('active'))draw()});
 window.KintoVendorGrowthChartsV168={refresh};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();