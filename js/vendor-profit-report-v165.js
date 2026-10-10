/* KINTO V165: one paginated profit report and on-demand order details. */
(()=>{
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=(v,c='IQD')=>v==null?'غير مكتمل':Number(v).toLocaleString('en-US',{maximumFractionDigits:2})+' '+esc(c);
 function amount(value){if(value==null||String(value).trim()==='')return null;const n=Number(value);return Number.isFinite(n)?n:null}
 function calculate(data){
  const o=data?.order;if(!o)return null;
  const f=o.financial||{},sales=amount(f.gross_amount),commission=amount(f.commission_amount),other=amount(f.other_deductions),net=amount(f.net_amount),cost=amount(o.total_cost_local),expenses=amount(data.expense_total);
  if([sales,commission,other,net,expenses].some(x=>x==null)||Math.abs(sales-commission-other-net)>0.011)throw new Error('بيانات التسوية غير مكتملة أو غير متطابقة.');
  const complete=o.cost_frozen===true&&cost!=null&&cost>=0;
  return {sales,commission,other,net,cost:complete?cost:null,expenses,complete,profit:complete?Math.round((net-cost-expenses)*100)/100:null};
 }

const states=new WeakMap();
function state(w){if(!states.has(w))states.set(w,{page:1,query:'',from:null,to:null,list:null,detail:null,busy:false,detailBusy:false});return states.get(w)}
async function rpc(w,name,extra={}){
 let s;try{s=JSON.parse(w.sessionStorage.getItem('meshwar_vendor_session_v95')||'null')}catch{}
 if(!w.MeshwarVendorRuntime?.sb||!s?.token)throw Error('أعد تسجيل الدخول للمتجر.');
 const r=await w.MeshwarVendorRuntime.sb.rpc(name,{p_session_token:s.token,...extra});
 if(r.error)throw Error(r.error.message||'تعذر إكمال العملية.');
 return r.data;
}
function mount(w){
 const d=w.document,nav=d.querySelector('.vendor-main-tabs');if(!nav)return;
 if(!d.getElementById('vendorTabBtn-pl')){
  const b=d.createElement('button');b.id='vendorTabBtn-pl';b.type='button';b.className='vendor-main-tab';b.textContent='📈 الأرباح والخسائر';
  b.onclick=()=>{d.querySelectorAll('.vendor-main-tab,.vendor-tab-panel').forEach(x=>x.classList.remove('active'));b.classList.add('active');d.getElementById('vendorTab-pl').classList.add('active');refresh(w)};nav.append(b);
 }
 if(d.getElementById('vendorTab-pl'))return;
 const style=d.createElement('style');style.textContent=`
 #vendorTab-pl .profit-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
 #vendorTab-pl .profit-card{border:1px solid #b99b5244;border-radius:10px;padding:10px}
 #vendorTab-pl .profit-card strong{display:block;font-size:16px;margin-top:5px}
 #vendorTab-pl table{width:100%;border-collapse:collapse;font-size:13px;white-space:nowrap}
 #vendorTab-pl th,#vendorTab-pl td{padding:10px 8px;text-align:center;border-bottom:1px solid #b99b5233}
 #kintoProfitDialogV165{box-sizing:border-box;width:min(620px,94vw);max-height:85dvh;border:1px solid #b99b52;border-radius:16px;padding:16px;background:#0a2f23;color:#fff}
 #kintoProfitDialogV165::backdrop{background:#0009}
 .light #kintoProfitDialogV165{background:#f8fafc;color:#172a23}
 #kintoProfitDialogV165 .field{box-sizing:border-box;width:100%;padding:9px;margin:4px 0}
 @media(max-width:600px){#vendorTab-pl .profit-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
 `;d.head.append(style);
 const p=d.createElement('section');p.id='vendorTab-pl';p.className='vendor-tab-panel';
 p.innerHTML='<div class="glass rounded-3xl p-4 md:p-6"><h2 class="vendor-text text-xl font-black">الأرباح والخسائر</h2><p class="vendor-muted" style="font-size:12px;margin:6px 0">الطلبات المسلّمة · الربح من التكلفة المثبتة · الشحن خارج الحساب</p><div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0"><input id="profitQueryV165" class="field" maxlength="100" placeholder="بحث برقم الطلب" style="flex:1;min-width:130px"><label style="font-size:12px">من <input id="profitFromV165" type="date" class="field"></label><label style="font-size:12px">إلى <input id="profitToV165" type="date" class="field"></label><button id="profitApplyV165" class="vendor-order-filter" type="button">عرض / تحديث</button></div><div id="profitStatusV165" role="status"></div><div id="profitSummaryV165"></div><div style="overflow-x:auto;margin-top:12px"><table><thead><tr><th>الطلب</th><th>المبيعات</th><th>العمولة</th><th>التكلفة</th><th>المصاريف</th><th>الربح</th><th>التفاصيل</th></tr></thead><tbody id="profitRowsV165"></tbody></table></div><div id="profitPagerV165" style="display:flex;justify-content:center;align-items:center;gap:10px;margin-top:12px"></div></div>';
 (d.querySelector('main')||d.body).append(p);
 d.getElementById('profitApplyV165').onclick=()=>{const s=state(w);s.page=1;s.query=d.getElementById('profitQueryV165').value.trim();s.from=d.getElementById('profitFromV165').value||null;s.to=d.getElementById('profitToV165').value||null;refresh(w)};
 p.addEventListener('click',e=>{
  const page=e.target.closest('[data-profit-page]');if(page&&!page.disabled){state(w).page+=Number(page.dataset.profitPage);refresh(w)}
  const detail=e.target.closest('[data-profit-detail]');if(detail)openDetail(w,detail.dataset.profitDetail);
 });
 const dialog=d.createElement('dialog');dialog.id='kintoProfitDialogV165';dialog.setAttribute('aria-label','تفاصيل ربح الطلب');
 dialog.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center"><strong>تفاصيل ربح الطلب</strong><button type="button" data-profit-close>إغلاق ×</button></div><div id="profitDetailStatusV165" role="status" style="margin-top:8px"></div><div id="profitDetailBodyV165"></div>';d.body.append(dialog);
 dialog.addEventListener('click',e=>{
  if(e.target.closest('[data-profit-close]'))dialog.close();
  if(e.target.closest('[data-profit-capture]'))capture(w);
  if(e.target.closest('[data-profit-add-expense]'))addExpense(w);
 });
}
function draw(w){
 const s=state(w),d=w.document,data=s.list;d.getElementById('profitStatusV165').textContent=s.error||(s.busy?'جارٍ تحميل التقرير…':'');
 d.getElementById('profitApplyV165').disabled=s.busy;
 if(s.busy||s.error||!data){d.getElementById('profitRowsV165').innerHTML='';d.getElementById('profitSummaryV165').innerHTML='';d.getElementById('profitPagerV165').innerHTML='';return}
 const card=(label,v,c)=>'<div class="profit-card"><small>'+label+'</small><strong>'+money(v,c)+'</strong></div>';
 d.getElementById('profitSummaryV165').innerHTML=(data.summary||[]).map(x=>'<p style="font-size:12px;margin:10px 0">'+esc(x.currency)+' · '+Number(x.orders)+' طلب · '+Number(x.incomplete_orders)+' طلب غير مكتمل التكلفة أو التسوية</p><div class="profit-grid">'+card('المبيعات',x.sales,x.currency)+card('عمولة المنصة',x.commission,x.currency)+card('مستحق التاجر',x.net,x.currency)+card('التكلفة المثبتة للطلبات المكتملة',x.cost,x.currency)+card('المصاريف التشغيلية',x.expenses,x.currency)+card('ربح الطلبات المكتملة فقط',x.profit,x.currency)+'</div>').join('');
 d.getElementById('profitRowsV165').innerHTML=(data.rows||[]).map(r=>{
  let m;try{m=calculate({order:r,expense_total:r.expense_total})}catch{}
  return '<tr><td><b>'+esc(r.order_code)+'</b><small style="display:block">'+new Date(r.created_at).toLocaleDateString('en-GB')+' · '+Number(r.product_count)+' منتج</small></td><td>'+money(m?.sales,r.currency)+'</td><td>'+money(m?.commission,r.currency)+'</td><td>'+money(m?.cost,r.currency)+'</td><td>'+money(m?.expenses,r.currency)+'</td><td><b>'+money(m?.profit,r.currency)+'</b></td><td><button type="button" class="vendor-order-filter" data-profit-detail="'+esc(r.segment_id)+'">تفاصيل</button></td></tr>';
 }).join('')||'<tr><td colspan="7" style="padding:16px">لا توجد طلبات مسلّمة ضمن هذا البحث.</td></tr>';
 d.getElementById('profitPagerV165').innerHTML='<button type="button" class="vendor-order-filter" data-profit-page="-1" '+(data.page<=1?'disabled':'')+'>السابق</button><small>صفحة '+Number(data.page)+' من '+Number(data.pages)+' · '+Number(data.total)+' طلب</small><button type="button" class="vendor-order-filter" data-profit-page="1" '+(data.page>=data.pages?'disabled':'')+'>التالي</button>';
}
async function refresh(w){
 mount(w);const s=state(w);if(s.busy)return;s.busy=true;s.error='';draw(w);
 try{s.list=await rpc(w,'vendor_profit_list_v165',{p_page:s.page,p_query:s.query,p_from:s.from,p_to:s.to});s.page=s.list.page}
 catch(e){s.error='تعذر عرض التقرير: '+e.message}finally{s.busy=false;draw(w)}
}
function drawDetail(w){
 const s=state(w),d=w.document,body=d.getElementById('profitDetailBodyV165');d.getElementById('profitDetailStatusV165').textContent=s.detailError||(s.detailBusy?'جارٍ تحميل التفاصيل…':'');
 if(s.detailBusy||s.detailError){body.innerHTML='';return}
 const o=s.detail?.order;if(!o){body.innerHTML='<p>الطلب غير متاح لهذا المتجر.</p>';return}
 let m;try{m=calculate(s.detail)}catch(e){body.innerHTML='<p>'+esc(e.message)+'</p>';return}
 const c=o.currency||'IQD';
 body.innerHTML='<h3 style="margin:12px 0">'+esc(o.order_code)+'</h3><p style="font-size:12px">'+esc(o.statement_no||'غير مؤرشف')+'</p><p>المبيعات: '+money(m.sales,c)+' · العمولة: '+money(m.commission,c)+' · أخرى: '+money(m.other,c)+'</p><p>مستحق التاجر: <b>'+money(m.net,c)+'</b></p><p>تكلفة البضاعة: '+money(m.cost,c)+' · المصاريف: '+money(m.expenses,c)+'</p><p>صافي الربح: <b style="font-size:21px">'+money(m.profit,c)+'</b></p><small>المستحق − تكلفة البضاعة − المصاريف</small><h4 style="margin:14px 0 8px">تكلفة منتجات الطلب</h4>'+
 (o.cost_lines||[]).map(x=>'<div style="font-size:13px;padding:9px 0;border-bottom:1px solid #b99b5233"><b>'+esc(x.product_name)+'</b><div>'+esc(x.quantity)+' × '+money(x.unit_cost_usd,'USD')+' × '+esc(x.exchange_rate??'غير مسجل')+' = '+money(x.cost_local,c)+'</div></div>').join('')+
 (o.cost_frozen?'<p style="font-size:12px">🔒 تكلفة محفوظة؛ تعديل المنتج أو سعر الصرف لا يغيّرها.</p>':'<p style="font-size:12px">التكلفة المعروضة للمراجعة فقط. لا يدخل الطلب في الربح قبل اكتمال تكلفته وتثبيتها.</p><button type="button" data-profit-capture '+(!o.cost_ready?'disabled':'')+'>تثبيت التكلفة بعد مراجعتها</button>'+(!o.cost_ready?'<p style="font-size:12px">أكمل تكلفة المنتج المفقودة ثم أعد فتح التفاصيل. سعر صرف الطلب المفقود يحتاج مراجعة.</p>':''))+
 '<details style="margin-top:14px"><summary>المصاريف التشغيلية لهذا الطلب</summary><p style="font-size:12px">تُنقص الربح فقط؛ التسوية والأرشيف محفوظان.</p><input id="profitExpenseAmountV165" type="number" min="0.01" step="0.01" class="field" placeholder="المبلغ بـ '+esc(c)+'"><input id="profitExpenseCategoryV165" class="field" maxlength="100" placeholder="نوع المصروف"><input id="profitExpenseNoteV165" class="field" maxlength="1000" placeholder="ملاحظة اختيارية"><button type="button" data-profit-add-expense>إضافة مصروف</button>'+
 (s.detail.expenses||[]).map(x=>'<p style="font-size:13px">'+esc(x.category)+' · '+money(x.amount,c)+' '+esc(x.note||'')+'</p>').join('')+'</details>';
}
async function openDetail(w,id){
 const s=state(w);if(s.detailBusy)return;s.selected=id;s.detailBusy=true;s.detailError='';s.detail=null;
 const dialog=w.document.getElementById('kintoProfitDialogV165');if(!dialog.open)dialog.showModal();drawDetail(w);
 try{s.detail=await rpc(w,'vendor_profit_detail_v165',{p_segment_id:id})}catch(e){s.detailError='تعذر تحميل التفاصيل: '+e.message}finally{s.detailBusy=false;drawDetail(w)}
}
async function capture(w){
 const s=state(w),o=s.detail?.order;if(s.detailBusy||!o?.cost_ready)return;
 if(!w.confirm('تثبيت تكلفة '+o.order_code+' بعد مراجعة المنتجات؟\n'+(o.cost_lines||[]).map(x=>x.product_name+': '+money(x.cost_local,o.currency)).join('\n')))return;
 await write(w,'vendor_profit_capture_cost_v165',{p_expected_lines:o.cost_lines});
}
async function addExpense(w){
 const d=w.document,v=amount(d.getElementById('profitExpenseAmountV165')?.value),category=d.getElementById('profitExpenseCategoryV165')?.value.trim(),note=d.getElementById('profitExpenseNoteV165')?.value.trim();
 if(v==null||v<=0||!category){w.alert('أدخل مبلغًا موجبًا ونوع المصروف.');return}
 await write(w,'vendor_profit_add_expense_v165',{p_amount:v,p_category:category,p_note:note});
}
async function write(w,name,args){
 const s=state(w);if(s.detailBusy)return;s.detailBusy=true;s.detailError='';drawDetail(w);
 try{s.detail=await rpc(w,name,{p_segment_id:s.selected,...args});await refresh(w)}
 catch(e){s.detailError='تعذر حفظ العملية: '+e.message}finally{s.detailBusy=false;drawDetail(w)}
}
function install(w){if(!w||w.__kintoProfitV165)return;w.__kintoProfitV165=true;mount(w);if(w.document.getElementById('vendorTab-pl')?.classList.contains('active'))refresh(w)}
window.KintoVendorProfitV164={install,refresh,calculate};
})();