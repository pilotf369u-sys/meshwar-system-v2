/* V344: Store-owned rewards controls. All reads/writes use the verified vendor session RPCs. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const fmt=n=>Number(n||0).toLocaleString('en-US');
let state=null,loading=false,saving=false,nativeSetTab=null,rewardRows=[],rewardView='available',rewardPage=1;const PAGE_SIZE=10;
const session=()=>window.MeshwarVendorV94?.session?.();
const runtime=()=>window.MeshwarVendorRuntime;
const notice=(message,bad=false)=>runtime()?.showNotice?.(message,bad);
function ensureUi(){
  const nav=document.querySelector('.vendor-main-tabs'),main=document.querySelector('#dashboardView main');
  if(!nav||!main||$('vendorTab-rewards'))return false;
  const style=document.createElement('style');style.id='vendorRewardsV344Style';
  style.textContent='#vendorTab-rewards .vr-card{border:1px solid rgba(245,196,81,.27);background:rgba(255,255,255,.045);border-radius:16px;padding:16px;margin-bottom:12px}#vendorTab-rewards .vr-categories{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px}#vendorTab-rewards .vr-category{border:1px solid rgba(245,196,81,.26);border-radius:12px;padding:12px 6px;text-align:center}#vendorTab-rewards .vr-category b{display:block;font-size:18px;color:#f5c451}#vendorTab-rewards .vr-category small{display:block;font-size:11px}#vendorTab-rewards .vr-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:end}#vendorTab-rewards input[type=number]{width:105px;color:#172033;padding:9px;border-radius:9px}#vendorTab-rewards button{border-radius:9px;padding:9px 14px;background:#b88d31;color:#101f1a;font-weight:800}#vendorTab-rewards button:disabled{opacity:.5}#vendorTab-rewards .vr-category{cursor:pointer}#vendorTab-rewards .vr-category.active{background:rgba(245,196,81,.16);border-color:#f5c451}#vendorTab-rewards .vr-directory{margin-top:12px}#vendorTab-rewards .vr-search{width:100%;max-width:440px;padding:9px 11px;border-radius:10px;border:1px solid rgba(245,196,81,.28);background:rgba(255,255,255,.07);color:#fff}#vendorTab-rewards .vr-table-wrap{overflow:auto;margin-top:9px}#vendorTab-rewards table{width:100%;border-collapse:collapse;min-width:650px}#vendorTab-rewards th,#vendorTab-rewards td{padding:8px;border-bottom:1px solid rgba(245,196,81,.12);text-align:right;font-size:12px}#vendorTab-rewards .vr-pager{display:flex;justify-content:center;align-items:center;gap:8px;margin-top:9px}#vendorTab-rewards .vr-pager button{padding:6px 10px}#vendorTab-rewards .vr-count{font-size:11px;opacity:.8}@media(max-width:760px){#vendorTab-rewards .vr-card{padding:11px;border-radius:13px}#vendorTab-rewards .vr-categories{display:flex;overflow-x:auto;gap:6px;padding-bottom:4px;scrollbar-width:none}#vendorTab-rewards .vr-categories::-webkit-scrollbar{display:none}#vendorTab-rewards .vr-category{flex:0 0 auto;min-width:105px;padding:9px 7px;border-radius:10px}#vendorTab-rewards .vr-category small{font-size:10px}#vendorTab-rewards .vr-category b{font-size:13px;white-space:nowrap}#vendorTab-rewards .vr-actions{gap:7px}#vendorTab-rewards .vr-actions button{padding:8px 9px;font-size:12px}#vendorTab-rewards .vr-search{max-width:none;font-size:13px}#vendorTab-rewards table{min-width:0}#vendorTab-rewards thead{display:none}#vendorTab-rewards tbody,#vendorTab-rewards tr,#vendorTab-rewards td{display:block;width:100%}#vendorTab-rewards tr{border:1px solid rgba(245,196,81,.18);border-radius:11px;padding:8px;margin:8px 0}#vendorTab-rewards td{border:0;padding:4px 2px;font-size:12px}#vendorTab-rewards td:before{content:attr(data-label);font-weight:800;margin-left:8px;color:#f5c451}#vendorTab-rewards .vr-pager{flex-wrap:wrap;font-size:12px}}';
  document.head.appendChild(style);
  const button=document.createElement('button');button.id='vendorTabBtn-rewards';button.className='vendor-main-tab';button.type='button';button.textContent='🎁 مكافآت المتجر';button.onclick=()=>window.setVendorTab('rewards');nav.appendChild(button);
  const panel=document.createElement('section');panel.id='vendorTab-rewards';panel.className='vendor-tab-panel';
  panel.innerHTML='<div class="vr-card"><h2 class="text-xl font-black">مكافآت المتجر</h2><p class="text-sm">مكافآت متجرك مستقلة. تتحمل قيمة الخصم الممول من المتجر، بما في ذلك المتجر باشتراك شهري.</p><div id="vendorRewardsState" role="status">جاري التحميل...</div><div class="vr-actions"><label>نسبة الكسب عند التسليم القادم<br><input id="vendorRewardsRate" type="number" min="0" max="10" step="0.1" inputmode="decimal"> %</label><button id="vendorRewardsSave" type="button">حفظ النسبة وتفعيل الكسب</button><button id="vendorRewardsPause" type="button">إيقاف الكسب الجديد</button><button id="vendorRewardsReload" type="button">تحديث</button></div><p class="text-xs mt-3">التغيير لا يمس المكافآت المكتسبة سابقًا. عند الإيقاف، تبقى الكوبونات الصادرة صالحة إلى نهاية مدتها، والتقدم محفوظ.</p></div><div class="vr-card"><h3 class="font-black mb-3">تصنيف المكافآت</h3><div id="vendorRewardsCategories" class="vr-categories"></div><div id="vendorRewardsProgress" class="text-xs mt-3"></div><div class="vr-directory"><input id="vendorRewardSearch" class="vr-search" type="search" placeholder="بحث باسم العميل / الهاتف / الكود"><div class="vr-table-wrap"><table><thead><tr><th>العميل</th><th>الهاتف / الكود</th><th>العملة</th><th>قيد التجميع</th><th>المتاح</th><th>المستخدمة</th><th>منتهية الصلاحية</th><th>ممنوحة من الإدارة</th></tr></thead><tbody id="vendorRewardRows"><tr><td colspan="8">جاري التحميل...</td></tr></tbody></table></div><div class="vr-pager"><button id="vendorRewardPrev" type="button">السابق</button><span id="vendorRewardPage"></span><button id="vendorRewardNext" type="button">التالي</button><span id="vendorRewardCount" class="vr-count"></span></div></div></div>';
  main.appendChild(panel);
  $('vendorRewardsReload').onclick=load;
  $('vendorRewardsSave').onclick=()=>save(true);
  $('vendorRewardsPause').onclick=()=>save(false);
  $('vendorRewardSearch').oninput=()=>{rewardPage=1;renderRows()};
  $('vendorRewardPrev').onclick=()=>{rewardPage=Math.max(1,rewardPage-1);renderRows()};
  $('vendorRewardNext').onclick=()=>{rewardPage++;renderRows()};
  return true;
}
function categoryValue(r,key){if(key==='progress')return Number(r.progress_points||0);return Number(r[key]||0)}
function renderRows(){
 const body=$('vendorRewardRows');if(!body)return;const q=String($('vendorRewardSearch')?.value||'').trim().toLowerCase();
 const filtered=rewardRows.filter(r=>categoryValue(r,rewardView)>0).filter(r=>!q||[r.customer_name,r.phone,r.code,r.customer_id,r.currency].some(v=>String(v||'').toLowerCase().includes(q)));
 const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));rewardPage=Math.min(Math.max(1,rewardPage),pages);const rows=filtered.slice((rewardPage-1)*PAGE_SIZE,rewardPage*PAGE_SIZE);
 body.innerHTML=rows.map(r=>'<tr><td data-label="العميل">'+safe(r.customer_name||r.customer_id)+'</td><td data-label="الهاتف / الكود">'+safe([r.phone,r.code].filter(Boolean).join(' · ')||'---')+'</td><td data-label="العملة">'+safe(r.currency||'---')+'</td><td data-label="قيد التجميع">'+fmt(r.progress_points)+' / 1,000</td><td data-label="المتاح">'+fmt(r.available)+'</td><td data-label="المستخدمة">'+fmt(r.used)+'</td><td data-label="منتهية الصلاحية">'+fmt(r.expired)+'</td><td data-label="ممنوحة من الإدارة">'+fmt(r.admin)+'</td></tr>').join('')||'<tr><td colspan="8">لا يوجد عملاء في هذا التصنيف لمتجرك.</td></tr>';
 $('vendorRewardPage').textContent='صفحة '+rewardPage+' من '+pages;$('vendorRewardCount').textContent=filtered.length+' عميل';$('vendorRewardPrev').disabled=rewardPage<=1;$('vendorRewardNext').disabled=rewardPage>=pages;
}
const safe=v=>String(v??'---').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
async function loadRewardRows(){
 const token=session()?.token;if(!token)return;const sb=runtime().sb;
 try{
  const {data,error}=await sb.rpc('vendor_loyalty_customers_v375',{p_session_token:token});if(error)throw error;
  const raw=Array.isArray(data)?data:(data?.rows||[]);const ids=[...new Set(raw.map(x=>String(x.customer_id||'')).filter(Boolean))];let customers=[];
  if(ids.length){const res=await sb.from('customers').select('id,name,phone,code').in('id',ids);customers=res.data||[]}
  const cm=new Map(customers.map(x=>[String(x.id),x]));
  rewardRows=raw.map(r=>{const cu=cm.get(String(r.customer_id))||{};return{...r,customer_name:cu.name||cu.code||cu.phone||r.customer_id,phone:cu.phone||'',code:cu.code||''}});
  renderRows();
 }catch(e){console.error('Vendor reward customers failed',e);rewardRows=[];renderRows()}
}
function render(){if(!state)return;
  $('vendorRewardsState').textContent=`الحالة: ${state.enabled?'الكسب مفعّل':'الكسب متوقف'} · النسبة الحالية: ${Number(state.earn_rate)*100}% · الحد الأعلى: ${Number(state.max_earn_rate)*100}%`;
  $('vendorRewardsRate').value=String(Number(state.earn_rate)*100);
  $('vendorRewardsRate').max=String(Number(state.max_earn_rate)*100);
  const labels={available:'المتاح',progress:'قيد التجميع',used:'المستخدمة',expired:'منتهية الصلاحية',admin:'ممنوحة من الإدارة'};
  const groups=Object.fromEntries(Object.keys(labels).map(k=>[k,[]]));
  const totals={available:0,progress:0,used:0,expired:0,admin:0};
  for(const r of rewardRows){for(const k of Object.keys(totals))if(categoryValue(r,k)>0)totals[k]++}
  for(const key of Object.keys(groups))groups[key].push(totals[key]+' عميل');
  $('vendorRewardsCategories').innerHTML=Object.entries(labels).map(([key,label])=>`<div class="vr-category ${key===rewardView?'active':''}" data-vr-view="${key}"><small>${label}</small><b>${groups[key].length?groups[key].map(s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;')).join('<br>'):'0'}</b></div>`).join('');$('vendorRewardsCategories').querySelectorAll('[data-vr-view]').forEach(el=>el.onclick=()=>{rewardView=el.dataset.vrView;rewardPage=1;render();renderRows()});
  $('vendorRewardsProgress').textContent='التصنيف خاص بمتجرك فقط. الممنوحة من الإدارة تُعرض منفصلة حسب مصدرها، بما فيها ما استُخدم أو انتهت صلاحيته.';
}
async function load(){if(loading)return;const token=session()?.token;if(!token)return notice('سجّل الدخول مجدداً لعرض مكافآت المتجر.',true);
  loading=true;try{const {data,error}=await runtime().sb.rpc('vendor_loyalty_overview_v344',{p_session_token:token});if(error)throw error;state=data;await loadRewardRows();render()}
  catch(e){console.error('Vendor rewards load failed',e);$('vendorRewardsState').textContent='تعذر تحميل المكافآت. تحقق من تطبيق ترحيل V344.';notice('تعذر تحميل مكافآت المتجر.',true)}finally{loading=false}}
async function save(enabled){if(saving||!state)return;const token=session()?.token;if(!token)return notice('سجّل الدخول مجدداً لحفظ المكافآت.',true);
  const percent=Number($('vendorRewardsRate').value),cap=Number(state.max_earn_rate)*100;
  if(!Number.isFinite(percent)||percent<0||percent>cap||(enabled&&percent===0))return notice(`اختر نسبة أكبر من صفر ولا تتجاوز ${cap}%.`,true);
  const message=enabled?`تطبيق نسبة ${percent}% عند التسليم القادم لمتجرك؟`:'إيقاف كسب مكافآت جديدة عند التسليم؟ تبقى المكافآت والكوبونات السابقة محفوظة.';
  if(!confirm(message))return;
  saving=true;$('vendorRewardsSave').disabled=$('vendorRewardsPause').disabled=true;
  try{const {data,error}=await runtime().sb.rpc('vendor_save_loyalty_v344',{p_session_token:token,p_expected_updated_at:state.updated_at,p_enabled:enabled,p_earn_rate:percent/100});if(error)throw error;state=data;render();notice(enabled?'تم حفظ النسبة للتسليم القادم.':'تم إيقاف الكسب الجديد مع بقاء المكافآت السابقة.')}
  catch(e){console.error('Vendor rewards save failed',e);notice(String(e.message||e).includes('VERSION_CONFLICT')?'تغيرت الإعدادات في جلسة أخرى؛ سنعرض أحدث نسخة.':'تعذر حفظ إعدادات المكافآت.',true);await load()}
  finally{saving=false;$('vendorRewardsSave').disabled=$('vendorRewardsPause').disabled=false}}
function setTab(tab){$('vendorTab-rewards')?.classList.toggle('active',tab==='rewards');$('vendorTabBtn-rewards')?.classList.toggle('active',tab==='rewards');if(tab==='rewards'){document.querySelectorAll('.vendor-tab-panel:not(#vendorTab-rewards),.vendor-main-tab:not(#vendorTabBtn-rewards)').forEach(el=>el.classList.remove('active'));void load();return}return nativeSetTab?.(tab)}
function install(){if(!ensureUi())return false;nativeSetTab=window.setVendorTab?.bind(window);window.setVendorTab=setTab;return true}
let attempts=0;const timer=setInterval(()=>{if(runtime()&&window.MeshwarVendorV94&&window.setVendorTab&&install()){clearInterval(timer);return}if(++attempts>160)clearInterval(timer)},100);
})();
