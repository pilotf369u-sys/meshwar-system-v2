/* KINTO V168: ECharts interactive read-only merchant growth charts. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const session=()=>{try{return JSON.parse(sessionStorage.getItem('meshwar_vendor_session_v95')||'null')?.token||''}catch{return ''}};
const fmt=n=>Number(n).toLocaleString('en-US',{maximumFractionDigits:2});
const colors=['#34d399','#fbbf24','#818cf8'];
let seq=0,rows=null,trend=null,composition=null,range=null;
const status=s=>{const el=$('vendorGrowthChartStatusV168');if(el)el.textContent=s};
function validRow(r){return r&&/^\d{4}-\d{2}-\d{2}$/.test(r.day)&&typeof r.currency==='string'&&r.currency.length<16&&['sales','commission','deductions','net'].every(k=>r[k]!==null&&r[k]!==''&&Number.isFinite(Number(r[k])))}
function chart(el,old){if(!el||!window.echarts)return null;return old||window.echarts.init(el,null,{renderer:'canvas'})}
function redraw(){
 if(!rows||!range||!window.echarts)return;
 const currency=$('vendorGrowthChartCurrencyV168')?.value;
 const list=rows.filter(r=>r.currency===currency);
 const dates=[],lookup=new Map(list.map(r=>[r.day,Number(r.sales)]));
 for(let t=Date.parse(range.from+'T00:00:00Z'),end=Date.parse(range.to+'T00:00:00Z'),i=0;t<=end&&i<366;i++,t+=86400000)dates.push(new Date(t).toISOString().slice(0,10));
 trend=chart($('vendorGrowthTrendV168'),trend);
 composition=chart($('vendorGrowthCompositionV168'),composition);
 if(!trend||!composition)return;
 trend.setOption({backgroundColor:'transparent',color:[colors[0]],animationDuration:350,
  tooltip:{trigger:'axis',confine:true,valueFormatter:v=>fmt(v)+' '+currency},
  grid:{left:66,right:18,top:28,bottom:62,containLabel:false},
  xAxis:{type:'category',data:dates,axisLabel:{color:'#cbd5e1',hideOverlap:true},axisLine:{lineStyle:{color:'#64748b'}}},
  yAxis:{type:'value',min:0,axisLabel:{color:'#cbd5e1',formatter:v=>fmt(v)},splitLine:{lineStyle:{color:'rgba(255,255,255,.10)'}}},
  dataZoom:[{type:'inside',zoomOnMouseWheel:false,moveOnMouseWheel:false},{type:'slider',bottom:9,height:18,textStyle:{color:'#cbd5e1'}}],
  series:[{name:'المبيعات',type:'line',smooth:.2,showSymbol:dates.length<=35,symbolSize:7,areaStyle:{opacity:.12},data:dates.map(d=>lookup.get(d)||0)}]
 },true);
 const totals=[list.reduce((s,r)=>s+Number(r.net),0),list.reduce((s,r)=>s+Number(r.commission),0),list.reduce((s,r)=>s+Number(r.deductions),0)];
 const labels=['مستحق التاجر','العمولة','الخصومات الأخرى'];
 const valid=totals.every(v=>v>=0)&&totals.some(v=>v>0);
 composition.setOption({backgroundColor:'transparent',color:colors,
  tooltip:{trigger:'item',confine:true,formatter:p=>p.name+': '+fmt(p.value)+' '+currency+' ('+p.percent+'%)'},
  legend:{bottom:0,textStyle:{color:'#e2e8f0'},type:'scroll'},
  series:[{type:'pie',radius:['42%','70%'],center:['50%','42%'],avoidLabelOverlap:true,
   label:{show:false},emphasis:{label:{show:true,color:'#fff',fontSize:13}},
   data:valid?totals.map((v,i)=>({name:labels[i],value:v})):[]}]
 },true);
 $('vendorGrowthCompositionLegendV168').textContent=valid?labels.map((label,i)=>label+': '+fmt(totals[i])+' '+currency).join(' · '):'لا يوجد توزيع مالي موجب صالح للرسم لهذه الفترة.';
 trend.resize();composition.resize();
}
async function refresh(){
 const token=session(),client=window.MeshwarVendorRuntime?.sb,from=$('vendorGrowthFrom')?.value,to=$('vendorGrowthTo')?.value,request=++seq;
 if(!token||!client||!from||!to||from>to)return;
 const days=(Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000;
 if(!Number.isFinite(days)||days>365)return;
 if(!window.echarts){status('تعذر تحميل مكتبة الرسوم. بيانات المبيعات الأساسية ما زالت متاحة أعلاه.');return}
 status('جارٍ تحميل الرسوم التفاعلية…');
 try{
  const {data,error}=await client.rpc('vendor_growth_daily_v168',{p_session_token:token,p_from:from,p_to:to});
  if(error)throw error;
  if(request!==seq||session()!==token)return;
  if(!data||data.basis!=='delivered_v161_orders_by_creation_date'||!Array.isArray(data.days)||data.days.some(r=>!validRow(r)))throw Error('Invalid response');
  rows=data.days;range={from,to};
  const currencies=[...new Set(rows.map(r=>r.currency))].sort();
  const selector=$('vendorGrowthChartCurrencyV168'),previous=selector.value;
  selector.replaceChildren();
  for(const c of currencies){const option=document.createElement('option');option.value=c;option.textContent=c;selector.append(option)}
  if(currencies.includes(previous))selector.value=previous;
  if(!currencies.length){trend?.clear();composition?.clear();$('vendorGrowthCompositionLegendV168').textContent='لا توجد طلبات مسلّمة في الفترة.';status('لا توجد بيانات لرسمها.');return}
  redraw();
  status('رسوم تفاعلية من الطلبات المسلّمة وفق تاريخ إنشاء الطلب؛ الأيام بلا طلبات تظهر بصفر. توزيع المبيعات لا يعني توزيع الربح.');
 }catch(e){if(request===seq&&session()===token){status('تعذر تحميل الرسوم؛ تحقق من تنفيذ SQL V168.');console.warn('KINTO V168 charts:',e.message)}}
}
function init(){
 $('vendorGrowthForm')?.addEventListener('submit',()=>setTimeout(refresh,0));
 $('vendorGrowthChartCurrencyV168')?.addEventListener('change',redraw);
 window.addEventListener('resize',()=>{if($('vendorTab-growth')?.classList.contains('active')){trend?.resize();composition?.resize()}});
 if(window.ResizeObserver){const observer=new ResizeObserver(()=>{if($('vendorTab-growth')?.classList.contains('active')){trend?.resize();composition?.resize()}});for(const id of ['vendorGrowthTrendV168','vendorGrowthCompositionV168'])if($(id))observer.observe($(id))}
 window.addEventListener('meshwar:vendor-session-ready',()=>{seq++;rows=null;trend?.clear();composition?.clear()});
 window.KintoVendorGrowthChartsV168={refresh,resize:()=>{trend?.resize();composition?.resize()}};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();