/* MESHWAR_VENDOR_FINANCE_SETTLEMENT_V24 */
(function(){
  'use strict';
  const SB_URL='https://hsmmbloouskqdnptiiad.supabase.co';
  const SB_KEY='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
  const STORE_KEY='meshwar_vendor_store';
  const VERSION='20260824-1253';
  const q=v=>encodeURIComponent(String(v??''));
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const money=(v,c='')=>`${num(v).toLocaleString('en-US',{maximumFractionDigits:2})} ${c||''}`.trim();
  function store(win){try{return JSON.parse(win.sessionStorage.getItem(STORE_KEY)||'null')}catch{return null}}
  function dateOnly(v){if(!v)return'';const d=new Date(v);if(Number.isNaN(d.getTime()))return'';return d.toISOString().slice(0,10)}
  function localToday(){const d=new Date(),off=d.getTimezoneOffset()*60000;return new Date(d.getTime()-off).toISOString().slice(0,10)}
  function startOfDay(s){return s?new Date(`${s}T00:00:00`).getTime():null}
  function endOfDay(s){return s?new Date(`${s}T23:59:59.999`).getTime():null}
  function rowTime(row,expense=false){const raw=expense?(row?.expense_date||row?.created_at):(row?.created_at);const t=new Date(raw||0).getTime();return Number.isFinite(t)?t:0}

  async function request(win,path,{method='GET',body=null,prefer='return=representation'}={}){
    const r=await win.fetch(`${SB_URL}/rest/v1/${path}`,{method,cache:'no-store',headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`,'Content-Type':'application/json',Accept:'application/json',...(method!=='GET'?{Prefer:prefer}:{})},body:body==null?null:JSON.stringify(body)});
    const t=await r.text();if(!r.ok)throw new Error(t||`HTTP ${r.status}`);return t?JSON.parse(t):null;
  }

  function injectStyle(win){
    const d=win.document;if(d.getElementById('mwSettlementV24Style'))return;
    const s=d.createElement('style');s.id='mwSettlementV24Style';s.textContent=`
      #vendorTab-pl .mw-settle-toolbar{margin-top:1rem;padding:1rem;border:1px solid rgba(212,175,55,.28);border-radius:1rem;background:rgba(15,23,42,.42)}
      #vendorTab-pl .mw-settle-grid{display:grid;grid-template-columns:repeat(2,minmax(150px,1fr)) auto auto;gap:.65rem;align-items:end}
      #vendorTab-pl .mw-settle-label{display:block;margin-bottom:.35rem;font-size:.72rem;font-weight:900;color:#94a3b8}
      #vendorTab-pl .mw-settle-btn{border:1px solid rgba(212,175,55,.45);background:rgba(212,175,55,.14);color:#f8d66d;border-radius:.75rem;padding:.72rem .9rem;font-weight:900;cursor:pointer;min-height:44px}
      #vendorTab-pl .mw-settle-btn.primary{background:#d4af37;color:#111827}
      #vendorTab-pl .mw-settle-btn:disabled{opacity:.55;cursor:not-allowed}
      #vendorTab-pl #mwSettlementStatus{min-height:1.1rem;margin-top:.6rem;font-size:.76rem;font-weight:800}
      #vendorTab-pl #mwSettlementStatus[data-tone="ok"]{color:#34d399}#vendorTab-pl #mwSettlementStatus[data-tone="error"]{color:#f87171}#vendorTab-pl #mwSettlementStatus[data-tone="busy"]{color:#fbbf24}
      #vendorTab-pl .mw-settlement-history{margin-top:1.5rem;padding-top:1rem;border-top:1px solid rgba(148,163,184,.16)}
      #vendorTab-pl .mw-settlement-table{width:100%;border-collapse:collapse}#vendorTab-pl .mw-settlement-table th,#vendorTab-pl .mw-settlement-table td{padding:.6rem;border-bottom:1px solid rgba(148,163,184,.16);text-align:center;font-size:.76rem}
      .light #vendorTab-pl .mw-settle-toolbar{background:#f3f4f6;border-color:#d1d5db}.light #vendorTab-pl .mw-settle-label{color:#475569}
      @media(max-width:900px){#vendorTab-pl .mw-settle-grid{grid-template-columns:1fr 1fr}}@media(max-width:560px){#vendorTab-pl .mw-settle-grid{grid-template-columns:1fr}.mw-settlement-table{display:block;overflow:auto;white-space:nowrap}}
    `;d.head.appendChild(s);
  }

  function injectUi(win){
    const d=win.document,panel=d.getElementById('vendorTab-pl');if(!panel)return false;
    const kpis=panel.querySelector('.mw-pl-kpis');if(!kpis)return false;
    if(!d.getElementById('mwSettlementToolbar')){
      const toolbar=d.createElement('section');toolbar.id='mwSettlementToolbar';toolbar.className='mw-settle-toolbar';toolbar.innerHTML=`
        <div class="vendor-text mb-3 font-black">🗓️ الفترة المالية وتقفيل الحساب</div>
        <div class="mw-settle-grid">
          <label><span class="mw-settle-label">من تاريخ</span><input id="mwPlDateFrom" class="field" type="date"></label>
          <label><span class="mw-settle-label">إلى تاريخ</span><input id="mwPlDateTo" class="field" type="date"></label>
          <button id="mwPlApplyPeriod" type="button" class="mw-settle-btn">تطبيق الفترة</button>
          <button id="mwPlClosePeriod" type="button" class="mw-settle-btn primary">🔒 تقفيل الفترة الحالية</button>
        </div><div id="mwSettlementStatus" aria-live="polite"></div>`;
      kpis.parentNode.insertBefore(toolbar,kpis);
    }
    if(!d.getElementById('mwSettlementHistory')){
      const history=d.createElement('section');history.id='mwSettlementHistory';history.className='mw-settlement-history';history.innerHTML=`<div class="vendor-text mb-2 font-black">📚 سجل الدورات المالية المغلقة</div><div class="vendor-table-wrap"><table class="mw-settlement-table"><thead><tr><th>الفترة</th><th>المبيعات</th><th>COGS</th><th>العمولات/الخصومات</th><th>المصاريف</th><th>صافي الربح</th><th>الحالة</th><th>كشف الحساب</th></tr></thead><tbody id="mwSettlementBody"><tr><td colspan="8">جارٍ التحميل…</td></tr></tbody></table></div>`;
      panel.appendChild(history);
    }
    bindControls(win);return true;
  }

  function status(win,text,tone=''){const el=win.document.getElementById('mwSettlementStatus');if(el){el.textContent=text||'';el.dataset.tone=tone}}
  function financeApi(win){return win.parent?.MeshwarVendorFinanceV21||win.MeshwarVendorFinanceV21}
  function expenseApi(win){return win.parent?.MeshwarVendorPlExpenseV23||win.MeshwarVendorPlExpenseV23}

  async function loadSettlements(win){
    const st=store(win);if(!st?.id)return[];
    const rows=await request(win,`financial_settlements?select=*&store_id=eq.${q(st.id)}&order=period_end.desc,closed_at.desc`);
    win.__mwSettlementV24Rows=Array.isArray(rows)?rows:[];return win.__mwSettlementV24Rows;
  }
  function latestClosedAt(win){const rows=win.__mwSettlementV24Rows||[];if(!rows.length)return null;const t=new Date(rows[0].period_end||rows[0].closed_at||0).getTime();return Number.isFinite(t)?t:null}

  async function sourceData(win){
    const f=financeApi(win);if(!f?.refresh||!f?.orderMetrics)throw new Error('طبقة P&L الأساسية غير جاهزة.');
    await f.refresh(win,true);
    const data=win.__mwFinanceV21Data||{st:store(win),orders:[],products:[],expenses:[]};
    let expenses=data.expenses||[];const eapi=expenseApi(win);if(eapi?.fetchOperatingExpenses){try{expenses=await eapi.fetchOperatingExpenses(win)}catch(e){console.warn('V24 expense fetch fallback',e)}}
    return{st:data.st||store(win),orders:data.orders||[],products:data.products||[],expenses:Array.isArray(expenses)?expenses:[]};
  }

  function effectiveRange(win,from,to,{respectClose=true}={}){
    let start=startOfDay(from),end=endOfDay(to);if(start==null||end==null||end<start)throw new Error('حدد فترة صحيحة: تاريخ البداية يجب أن يسبق أو يساوي تاريخ النهاية.');
    if(respectClose){const cutoff=latestClosedAt(win);if(cutoff!=null&&cutoff>start)start=cutoff+1}
    return{start,end};
  }

  function calculate(win,data,from,to,opts={}){
    const api=financeApi(win),{start,end}=effectiveRange(win,from,to,opts),st=data.st;if(!st)return null;
    const orders=(data.orders||[]).filter(o=>{const t=rowTime(o,false);return t>=start&&t<=end});
    const expenses=(data.expenses||[]).filter(x=>{const t=rowTime(x,true);return t>=start&&t<=end});
    let sales=0,cogs=0,fees=0,orderProfit=0,missing=0,estimated=0;
    const orderRows=orders.map(o=>{const m=api.orderMetrics(o,data.products||[],st.commission_rate??10);sales+=m.sales;cogs+=m.cogs;fees+=m.commission+m.other;orderProfit+=m.profit;if(m.costSource==='missing')missing++;if(m.costSource==='estimate')estimated++;return{o,m}});
    const op=expenses.reduce((a,x)=>a+num(x.amount),0),net=orderProfit-op;
    return{st,from,to,start,end,orders,expenses,orderRows,sales,cogs,fees,op,net,missing,estimated};
  }

  function renderPeriod(win,calc){
    if(!calc)return;const d=win.document,cur=calc.st.exchange_target_currency||calc.st.default_currency||'USD',set=(id,v)=>{const el=d.getElementById(id);if(el)el.textContent=money(v,cur)};
    set('mwPlSales',calc.sales);set('mwPlCogs',calc.cogs);set('mwPlFees',calc.fees);set('mwPlExpenses',calc.op);set('mwPlNet',calc.net);
    const body=d.getElementById('mwPlOrdersBody');if(body){body.innerHTML=calc.orderRows.map(({o,m})=>`<tr><td>${esc(o.order_code||o.id)}</td><td>${money(m.sales,cur)}</td><td>${money(m.cogs,cur)}</td><td>${money(m.commission+m.other,cur)}</td><td>${money(m.profit,cur)}</td><td><button class="mw-pl-action" data-mw-invoice="${esc(o.id)}" data-mw-v24-invoice="${esc(o.id)}">فاتورة</button></td></tr>`).join('')||'<tr><td colspan="6">لا توجد طلبات مسلّمة ضمن هذه الفترة.</td></tr>';body.querySelectorAll('[data-mw-v24-invoice]').forEach(b=>b.addEventListener('click',()=>financeApi(win)?.openInvoice?.(win,calc.orders.find(o=>String(o.id)===String(b.dataset.mwV24Invoice)),calc.st?win.__mwFinanceV21Data?.products||[]:[],calc.st)))}
    const list=d.getElementById('mwExpenseList');if(list)list.innerHTML=calc.expenses.length?calc.expenses.map(x=>`<div class="flex justify-between border-b border-white/10 py-2"><span>${esc(x.category||'مصروف')} — ${esc(x.note||'')}</span><strong>${money(x.amount,x.currency||cur)}</strong></div>`).join(''):'<div class="vendor-muted">لا توجد مصاريف تشغيلية ضمن هذه الفترة.</div>';
    const warning=d.getElementById('mwPlWarning');if(warning){const msgs=[];if(calc.estimated)msgs.push(`${calc.estimated} طلب يستخدم تكلفة حالية كتقدير.`);if(calc.missing)msgs.push(`${calc.missing} طلب بدون تكلفة مثبتة.`);warning.textContent=msgs.join(' ');warning.classList.toggle('hidden',!msgs.length)}
    win.__mwSettlementV24Current=calc;
  }

  async function initializeDates(win,data){
    const d=win.document,from=d.getElementById('mwPlDateFrom'),to=d.getElementById('mwPlDateTo');if(!from||!to)return;
    if(!to.value)to.value=localToday();
    if(!from.value){const cutoff=latestClosedAt(win);if(cutoff!=null)from.value=dateOnly(cutoff);else{const times=[...(data.orders||[]).map(x=>rowTime(x,false)),...(data.expenses||[]).map(x=>rowTime(x,true))].filter(Boolean);from.value=times.length?dateOnly(Math.min(...times)):localToday()}}
  }

  async function refreshPeriod(win,{quiet=false}={}){
    if(win.__mwSettlementV24RefreshPromise)return win.__mwSettlementV24RefreshPromise;
    win.__mwSettlementV24RefreshPromise=(async()=>{try{
      if(!quiet)status(win,'جارٍ تحميل الفترة المالية…','busy');
      await loadSettlements(win);const data=await sourceData(win);await initializeDates(win,data);
      const d=win.document,from=d.getElementById('mwPlDateFrom')?.value,to=d.getElementById('mwPlDateTo')?.value,calc=calculate(win,data,from,to,{respectClose:true});renderPeriod(win,calc);renderHistory(win,win.__mwSettlementV24Rows||[]);if(!quiet)status(win,'تم تحديث أرقام الفترة الحالية.','ok');return calc;
    }catch(e){console.error('V24 period refresh failed',e);status(win,'تعذر تحميل الفترة: '+(e?.message||e),'error');throw e}finally{win.__mwSettlementV24RefreshPromise=null}})();return win.__mwSettlementV24RefreshPromise;
  }

  function settlementPayload(calc){
    const st=calc.st,now=new Date(),selectedEnd=endOfDay(calc.to),periodEnd=Math.min(selectedEnd,now.getTime());
    return{store_id:String(st.id),period_start:new Date(calc.start).toISOString(),period_end:new Date(periodEnd).toISOString(),currency:st.exchange_target_currency||st.default_currency||'USD',total_sales:calc.sales,total_commission_fees:calc.fees,total_cogs:calc.cogs,total_operating_expenses:calc.op,net_profit:calc.net,status:'settled',closed_at:now.toISOString(),snapshot:{version:VERSION,selected_from:calc.from,selected_to:calc.to,order_count:calc.orders.length,expense_count:calc.expenses.length,order_ids:calc.orders.map(o=>o.id),expense_ids:calc.expenses.map(x=>x.id),missing_cost_count:calc.missing,estimated_cost_count:calc.estimated}};
  }

  async function closePeriod(win){
    const d=win.document,btn=d.getElementById('mwPlClosePeriod');if(btn?.dataset.busy==='1')return;
    try{
      status(win,'جارٍ تجهيز Snapshot للفترة…','busy');if(btn){btn.dataset.busy='1';btn.disabled=true}
      const calc=await refreshPeriod(win,{quiet:true});if(!calc)throw new Error('لا توجد بيانات P&L متاحة.');
      if(calc.end<calc.start)throw new Error('هذه الفترة تقع بالكامل ضمن دورة مغلقة سابقًا.');
      const ok=win.confirm?.(`تقفيل الفترة من ${calc.from} إلى ${calc.to}؟\nسيتم حفظ Snapshot نهائي ولن تُحسب هذه الفترة مرة أخرى ضمن الدورة المفتوحة.`);if(ok===false){status(win,'تم إلغاء التقفيل.','');return}
      const payload=settlementPayload(calc);if(new Date(payload.period_end).getTime()<new Date(payload.period_start).getTime())throw new Error('لا توجد مدة مفتوحة قابلة للتقفيل ضمن الفترة المحددة.');
      await request(win,'financial_settlements',{method:'POST',body:payload});status(win,'تم تقفيل الفترة وحفظ Snapshot. جارٍ بدء دورة جديدة…','busy');
      await loadSettlements(win);const from=d.getElementById('mwPlDateFrom'),to=d.getElementById('mwPlDateTo');if(from)from.value=dateOnly(payload.period_end);if(to)to.value=localToday();await refreshPeriod(win,{quiet:true});status(win,'تم تقفيل الحساب وبدء الدورة المالية الجديدة.','ok');
    }catch(e){console.error('V24 close period failed',e);const msg=String(e?.message||e);status(win,msg.includes('financial_settlements')?'تعذر التقفيل: نفّذ SQL Migration الخاص بجدول financial_settlements أولًا.':'تعذر تقفيل الفترة: '+msg,'error')}
    finally{if(btn){btn.dataset.busy='0';btn.disabled=false}}
  }

  function renderHistory(win,rows){
    const body=win.document.getElementById('mwSettlementBody');if(!body)return;
    body.innerHTML=(rows||[]).map(x=>`<tr><td>${esc(dateOnly(x.period_start))} → ${esc(dateOnly(x.period_end))}</td><td>${money(x.total_sales,x.currency)}</td><td>${money(x.total_cogs,x.currency)}</td><td>${money(x.total_commission_fees,x.currency)}</td><td>${money(x.total_operating_expenses,x.currency)}</td><td><strong>${money(x.net_profit,x.currency)}</strong></td><td>${esc(x.status==='settled'?'مغلق':'Settled')}</td><td><button type="button" class="mw-settle-btn" data-mw-settlement-print="${esc(x.id)}">🖨️ كشف</button></td></tr>`).join('')||'<tr><td colspan="8">لا توجد دورات مالية مغلقة بعد.</td></tr>';
    body.querySelectorAll('[data-mw-settlement-print]').forEach(b=>b.addEventListener('click',()=>printSettlement(win,(rows||[]).find(x=>String(x.id)===String(b.dataset.mwSettlementPrint))));
  }

  function printSettlement(win,x){
    if(!x)return;const st=store(win),w=win.open('','_blank','width=960,height=760');if(!w){win.alert?.('يرجى السماح بالنوافذ المنبثقة لفتح كشف الحساب.');return}
    const snap=x.snapshot||{};w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>كشف دورة مالية</title><style>body{font-family:Arial,sans-serif;margin:0;padding:28px;background:#f3f4f6;color:#111827}.sheet{max-width:900px;margin:auto;background:#fff;border:1px solid #d1d5db;border-radius:18px;padding:28px}.head{text-align:center;border-bottom:2px solid #d4af37;padding-bottom:14px}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:18px}.card{border:1px solid #d1d5db;border-radius:10px;padding:12px}.card span{display:block;color:#6b7280;font-size:12px}.card b{display:block;margin-top:5px;font-size:17px}.net{grid-column:1/-1;border-color:#d4af37}.meta{margin-top:18px;font-size:12px;color:#4b5563}.actions{text-align:center;margin-bottom:14px}.actions button{border:0;border-radius:10px;background:#111827;color:#fff;padding:10px 18px;font-weight:800}@media print{body{background:#fff;padding:0}.sheet{border:0}.actions{display:none}}</style></head><body><div class="actions"><button onclick="window.print()">طباعة / حفظ PDF</button></div><main class="sheet"><div class="head"><h2>MeshWar — كشف حساب دورة مالية مغلقة</h2><h1>${esc(st?.store_name||'المتجر')}</h1><div>${esc(dateOnly(x.period_start))} → ${esc(dateOnly(x.period_end))}</div></div><section class="grid"><div class="card"><span>إجمالي المبيعات</span><b>${money(x.total_sales,x.currency)}</b></div><div class="card"><span>تكلفة البضاعة COGS</span><b>${money(x.total_cogs,x.currency)}</b></div><div class="card"><span>العمولات والخصومات</span><b>${money(x.total_commission_fees,x.currency)}</b></div><div class="card"><span>المصاريف التشغيلية</span><b>${money(x.total_operating_expenses,x.currency)}</b></div><div class="card net"><span>صافي الربح</span><b>${money(x.net_profit,x.currency)}</b></div></section><div class="meta">الحالة: مغلق / Settled<br>تاريخ التقفيل: ${esc(new Date(x.closed_at).toLocaleString('en-US'))}<br>عدد الطلبات: ${esc(snap.order_count??'—')} — عدد المصاريف: ${esc(snap.expense_count??'—')}</div></main></body></html>`);w.document.close();
  }

  function bindControls(win){
    const d=win.document,apply=d.getElementById('mwPlApplyPeriod'),close=d.getElementById('mwPlClosePeriod'),refresh=d.getElementById('mwPlRefresh');
    if(apply&&!apply.dataset.mwV24){apply.addEventListener('click',()=>refreshPeriod(win));apply.dataset.mwV24='1'}
    if(close&&!close.dataset.mwV24){close.addEventListener('click',()=>closePeriod(win));close.dataset.mwV24='1'}
    if(refresh&&!refresh.dataset.mwV24){refresh.addEventListener('click',()=>refreshPeriod(win,{quiet:true}).catch(()=>{}));refresh.dataset.mwV24='1'}
  }

  function ensureUi(win,{refresh=false}={}){
    injectStyle(win);
    const ready=injectUi(win);
    if(ready&&refresh&&win.document.getElementById('vendorTab-pl')?.classList.contains('active')){
      refreshPeriod(win,{quiet:true}).catch(err=>console.warn('V24 P&L refresh failed',err));
    }
    return ready;
  }

  function bindPlTab(win){
    if(win.__mwSettlementV24TabBound)return;
    win.document.addEventListener('click',e=>{
      const tab=e.target?.closest?.('#vendorTabBtn-pl');if(!tab)return;
      win.requestAnimationFrame(()=>ensureUi(win,{refresh:true}));
    },true);
    win.__mwSettlementV24TabBound=true;
  }

  function observePlDom(win){
    if(win.__mwSettlementV24Observer)return;
    const ob=new win.MutationObserver(()=>{
      const d=win.document;if(!d.querySelector('#vendorTab-pl .mw-pl-kpis'))return;
      if(d.getElementById('mwSettlementToolbar')&&d.getElementById('mwSettlementHistory'))return;
      ensureUi(win,{refresh:d.getElementById('vendorTab-pl')?.classList.contains('active')});
    });
    ob.observe(win.document.documentElement,{childList:true,subtree:true});
    win.__mwSettlementV24Observer=ob;
  }

  function boot(win){
    injectStyle(win);bindPlTab(win);observePlDom(win);ensureUi(win,{refresh:win.document.getElementById('vendorTab-pl')?.classList.contains('active')});win.__mwVendorFinanceSettlementV24=true;
  }
  function install(win){if(!win)return;if(win.document.readyState==='loading')win.document.addEventListener('DOMContentLoaded',()=>boot(win),{once:true});else boot(win)}
  window.MeshwarVendorFinanceSettlementV24={install,ensureUi,injectUi,refreshPeriod,closePeriod,loadSettlements,calculate,VERSION};
})();
