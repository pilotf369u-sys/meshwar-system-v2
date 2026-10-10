/* KINTO V164: one profit report, scoped to KN-000100 during acceptance testing. */
(function(){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
 const money=(v,c='IQD')=>v==null?'غير مكتمل':Number(v).toLocaleString('en-US',{maximumFractionDigits:2})+' '+c;
 const states=new WeakMap();
 function state(win){if(!states.has(win))states.set(win,{data:null,busy:false,error:'',promise:null});return states.get(win)}
 function amount(value){if(value==null||String(value).trim()==='')return null;const n=Number(value);return Number.isFinite(n)?n:null}
 function calculate(data){
  const o=data?.order;if(!o)return null;
  const f=o.financial||{},sales=amount(f.gross_amount),commission=amount(f.commission_amount),other=amount(f.other_deductions),net=amount(f.net_amount),cost=amount(o.total_cost_local),expenses=amount(data.expense_total);
  if([sales,commission,other,net,expenses].some(x=>x==null)||Math.abs(sales-commission-other-net)>0.011)throw new Error('بيانات التسوية غير مكتملة أو غير متطابقة.');
  const complete=o.cost_frozen===true&&cost!=null&&cost>=0;
  return {sales,commission,other,net,cost:complete?cost:null,expenses,complete,profit:complete?Math.round((net-cost-expenses)*100)/100:null};
 }
 async function rpc(win,name,extra={}){
  const runtime=win.MeshwarVendorRuntime;
  let session;try{session=JSON.parse(win.sessionStorage.getItem('meshwar_vendor_session_v95')||'null')}catch{}
  if(!runtime?.sb||!session?.token)throw new Error('جلسة المتجر غير جاهزة؛ أعد تسجيل الدخول.');
  const r=await runtime.sb.rpc(name,{p_session_token:session.token,...extra});
  if(r.error)throw new Error(r.error.message||'تعذر تحميل تقرير الربح.');
  return r.data;
 }
 function mount(win){
  const d=win.document,nav=d.querySelector('.vendor-main-tabs');if(!nav)return;
  if(!d.getElementById('vendorTabBtn-pl')){
   const b=d.createElement('button');b.type='button';b.id='vendorTabBtn-pl';b.className='vendor-main-tab';b.textContent='📈 الأرباح والخسائر';
   b.addEventListener('click',()=>{d.querySelectorAll('.vendor-main-tab,.vendor-tab-panel').forEach(x=>x.classList.remove('active'));b.classList.add('active');d.getElementById('vendorTab-pl').classList.add('active');refresh(win)});nav.append(b);
  }
  if(d.getElementById('vendorTab-pl'))return;
  const panel=d.createElement('section');panel.id='vendorTab-pl';panel.className='vendor-tab-panel';
  panel.innerHTML='<div class="glass rounded-3xl p-4 md:p-6"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><div><h2 class="vendor-text text-xl font-black">الأرباح والخسائر</h2><p class="vendor-muted" style="font-size:12px;margin-top:6px">اختبار حساب KN-000100 فقط · التسوية المؤرشفة محفوظة</p></div><button id="kintoProfitRefreshV164" type="button" class="vendor-order-filter">تحديث</button></div><div id="kintoProfitStatusV164" role="status" style="margin-top:10px;font-size:13px"></div><div id="kintoProfitContentV164"></div></div>';
  (d.querySelector('main')||d.body).append(panel);
  d.getElementById('kintoProfitRefreshV164').addEventListener('click',()=>refresh(win));
  panel.addEventListener('click',e=>{if(e.target.closest('[data-profit-capture]'))capture(win);if(e.target.closest('[data-profit-add-expense]'))addExpense(win)});
 }
 function draw(win){
  mount(win);const s=state(win),d=win.document,status=d.getElementById('kintoProfitStatusV164'),content=d.getElementById('kintoProfitContentV164');
  if(!status||!content)return;
  status.textContent=s.error|| (s.busy?'جارٍ تحميل التقرير…':'');status.style.color=s.error?'#ef4444':'inherit';
  d.getElementById('kintoProfitRefreshV164').disabled=s.busy;
  if(s.error||s.busy){content.innerHTML='';return}
  const o=s.data?.order;if(!o){content.innerHTML='<p style="padding:12px 0">لا يوجد طلب KN-000100 مسلّم لهذا المتجر.</p>';return}
  let m;try{m=calculate(s.data)}catch(e){status.textContent=e.message;content.innerHTML='';return}
  const cur=o.currency||'IQD';
  const card=(label,value)=>'<div style="border:1px solid #b99b5244;border-radius:12px;padding:12px"><small class="vendor-muted">'+label+'</small><strong style="display:block;margin-top:5px;font-size:17px">'+money(value,cur)+'</strong></div>';
  const frozen=o.cost_frozen===true,lines=Array.isArray(o.cost_lines)?o.cost_lines:[],expenses=Array.isArray(s.data.expenses)?s.data.expenses:[];
  content.innerHTML='<p style="font-size:12px;margin:12px 0">الطلب <b>'+esc(o.order_code)+'</b> · '+esc(o.statement_no||'غير مؤرشف')+'</p>'+
   '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">'+card('مبيعات الطلب',m.sales)+card('عمولة المنصة',m.commission)+card('خصومات / أخرى',m.other)+card('صافي مستحق التاجر',m.net)+card('تكلفة البضاعة المثبتة',m.cost)+card('المصاريف التشغيلية',m.expenses)+
   '<div style="grid-column:1/-1;border:1px solid #b99b5277;border-radius:12px;padding:14px"><small>صافي الربح بعد المصاريف</small><strong style="display:block;font-size:22px;margin-top:5px">'+money(m.profit,cur)+'</strong><small style="display:block;margin-top:6px">'+(m.complete?'صافي المستحق − تكلفة البضاعة − المصاريف التشغيلية':'لا يُحتسب الربح حتى تُسجّل وتُثبّت تكلفة جميع منتجات الطلب.')+'</small></div></div>'+
   '<h3 style="margin:16px 0 8px;font-weight:bold">تفاصيل تكلفة البضاعة</h3>'+lines.map(x=>'<div style="padding:10px 0;border-bottom:1px solid #b99b5233;font-size:13px"><b>'+esc(x.product_name)+'</b><div style="margin-top:4px">الكمية: '+esc(x.quantity)+' · تكلفة الوحدة: '+money(x.unit_cost_usd,'USD')+'</div><div>سعر صرف الطلب: '+(x.exchange_rate==null?'غير مسجل':esc(x.exchange_rate)+' IQD / USD')+' · التكلفة: '+money(x.cost_local,cur)+'</div></div>').join('')+
   '<p style="font-size:12px;margin:10px 0">'+(frozen?'🔒 التكلفة مثبتة بتاريخ '+esc(new Date(o.cost_captured_at).toLocaleString('en-GB'))+'؛ لا تتغير بتعديل المنتج أو سعر الصرف.':'تكلفة المنتج الحالية معروضة للمراجعة فقط، وسعر الصرف مأخوذ من الطلب. لا تدخل في الربح حتى تثبيتها.')+'</p>'+
   (!frozen?'<button data-profit-capture type="button" class="vendor-order-filter" '+(!o.cost_ready?'disabled':'')+'>تثبيت تكلفة هذا الطلب</button><p style="font-size:12px;margin-top:6px">'+(!o.cost_ready?'سجّل تكلفة المنتج المفقودة من تعديل المنتج ثم حدّث التقرير. سعر الصرف المفقود يحتاج مراجعة بيانات الطلب.':'راجع تكلفة كل منتج قبل تثبيتها؛ التثبيت لا يعدّل التسوية المؤرشفة.')+'</p>':'')+
   '<details style="margin-top:16px;border:1px solid #b99b5244;border-radius:12px;padding:10px"><summary style="cursor:pointer;font-weight:bold">المصاريف التشغيلية لهذا الاختبار</summary><p style="font-size:12px;margin:8px 0">بعملة الطلب '+esc(cur)+'؛ تُخصم من الربح فقط ولا تغيّر مستحق التاجر أو الأرشيف.</p><div style="display:grid;gap:8px"><input id="kintoProfitExpenseAmountV164" type="number" min="0.01" step="0.01" class="field" placeholder="المبلغ بـ '+esc(cur)+'"><input id="kintoProfitExpenseCategoryV164" maxlength="100" class="field" placeholder="نوع المصروف"><input id="kintoProfitExpenseNoteV164" maxlength="1000" class="field" placeholder="ملاحظة اختيارية"><button data-profit-add-expense type="button" class="vendor-order-filter">إضافة مصروف</button></div><div style="margin-top:8px">'+(expenses.length?expenses.map(x=>'<div style="padding:8px 0;border-bottom:1px solid #b99b5233">'+esc(x.category)+' · '+money(x.amount,cur)+(x.note?' · '+esc(x.note):'')+'</div>').join(''):'لا توجد مصاريف مسجلة لهذا الاختبار.')+'</div></details>';
 }
 async function refresh(win){
  const s=state(win);if(s.promise)return s.promise;
  s.busy=true;s.error='';draw(win);
  s.promise=(async()=>{try{s.data=await rpc(win,'vendor_profit_report_v164')}catch(e){s.error='تعذر عرض التقرير: '+e.message}finally{s.busy=false;s.promise=null;draw(win)}})();
  return s.promise;
 }
 async function capture(win){
  const s=state(win);if(s.busy||!s.data?.order?.cost_ready)return;
  const rows=s.data.order.cost_lines||[];
  const description=rows.map(x=>String(x.product_name)+' — '+money(x.unit_cost_usd,'USD')+' × '+x.quantity+' × '+x.exchange_rate+' = '+money(x.cost_local)).join('\n');
  if(!win.confirm('تثبيت تكلفة الطلب بهذه القيم؟\n'+description+'\nلا تتغير التكلفة بعد التثبيت.'))return;
  await write(win,'vendor_profit_capture_cost_v164',{p_expected_lines:rows});
 }
 async function addExpense(win){
  const s=state(win);if(s.busy)return;
  const d=win.document,raw=d.getElementById('kintoProfitExpenseAmountV164')?.value,amountValue=amount(raw),category=String(d.getElementById('kintoProfitExpenseCategoryV164')?.value||'').trim(),note=String(d.getElementById('kintoProfitExpenseNoteV164')?.value||'').trim();
  if(amountValue==null||amountValue<=0||!category){win.alert('أدخل مبلغًا موجبًا ونوع المصروف.');return}
  await write(win,'vendor_profit_add_expense_v164',{p_amount:amountValue,p_category:category,p_note:note});
 }
 async function write(win,name,args={}){
  const s=state(win);if(s.busy)return;s.busy=true;s.error='';draw(win);
  try{s.data=await rpc(win,name,args)}catch(e){s.error='تعذر حفظ العملية: '+e.message}finally{s.busy=false;draw(win)}
 }
 function install(win){
  if(!win||win.__kintoProfitV164)return;win.__kintoProfitV164=true;mount(win);
  // No legacy refresh timers or other writers touch this panel.
  if(win.document.getElementById('vendorTab-pl')?.classList.contains('active'))refresh(win);
 }
 window.KintoVendorProfitV164={install,refresh,calculate};
})();