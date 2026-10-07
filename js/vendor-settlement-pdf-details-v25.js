/* MESHWAR_VENDOR_SETTLEMENT_PDF_DETAILS_V25 */
(function(){
  'use strict';
  const VERSION='20260824-1435';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[c]));
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
  const money=(v,c='')=>`${num(v).toLocaleString('en-US',{maximumFractionDigits:2})} ${c||''}`.trim();
  const dateOnly=v=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toISOString().slice(0,10)};
  const productName=o=>String(o?.details?.product_name||o?.product_name||'—').trim()||'—';
  const quantity=o=>Math.max(1,num(o?.details?.quantity||o?.quantity||1));

  function snapshotDetails(win){
    const calc=win.__mwSettlementV24Current;if(!calc)return{orders:[],expenses:[]};
    const cur=calc.st?.exchange_target_currency||calc.st?.default_currency||'USD';
    const orders=(calc.orderRows||[]).map(({o,m})=>({
      id:o.id,order_code:o.order_code||o.id,delivered_at:o.delivered_at||o.updated_at||o.created_at||null,
      product_name:productName(o),quantity:quantity(o),currency:o.currency||cur,
      sales:num(m.sales),cogs:num(m.cogs),fees:num(m.commission)+num(m.other),profit:num(m.profit),cost_source:m.costSource||null
    }));
    const expenses=(calc.expenses||[]).map(x=>({
      id:x.id,expense_date:x.expense_date||x.created_at||null,category:x.category||'مصروف',note:x.note||'',amount:num(x.amount),currency:x.currency||cur
    }));
    return{orders,expenses};
  }

  function enrichSettlementBody(win,body){
    const raw=JSON.parse(body),rows=Array.isArray(raw)?raw:[raw],details=snapshotDetails(win);
    rows.forEach(row=>{row.snapshot={...(row.snapshot||{}),detail_version:VERSION,orders:details.orders,expenses:details.expenses}});
    return JSON.stringify(Array.isArray(raw)?rows:rows[0]);
  }

  function armSettlementPost(win){
    if(win.__mwSettlementV25FetchArmed)return;
    const previous=win.fetch,wrapped=async function(input,init={}){
      const url=typeof input==='string'?input:String(input?.url||''),method=String(init?.method||input?.method||'GET').toUpperCase();
      if(method==='POST'&&/\/rest\/v1\/financial_settlements(?:\?|$)/.test(url)&&init?.body){
        if(win.fetch===wrapped)win.fetch=previous;win.__mwSettlementV25FetchArmed=false;
        try{init={...init,body:enrichSettlementBody(win,init.body)}}catch(e){console.error('V25 settlement snapshot enrichment failed',e)}
        return previous.call(win,input,init);
      }
      return previous.call(win,input,init);
    };
    win.fetch=wrapped;win.__mwSettlementV25FetchArmed=true;
    win.setTimeout(()=>{if(win.fetch===wrapped)win.fetch=previous;win.__mwSettlementV25FetchArmed=false},15000);
  }

  function bindCloseEnrichment(win){
    if(win.__mwSettlementV25CloseBound)return;
    win.document.addEventListener('click',e=>{
      if(!e.target?.closest?.('#mwPlClosePeriod'))return;
      if(win.__mwSettlementV25ConfirmArmed)return;
      const previousConfirm=win.confirm;
      win.confirm=function(){
        const result=typeof previousConfirm==='function'?previousConfirm.apply(win,arguments):true;
        win.confirm=previousConfirm;win.__mwSettlementV25ConfirmArmed=false;
        if(result!==false)armSettlementPost(win);
        return result;
      };
      win.__mwSettlementV25ConfirmArmed=true;
      win.setTimeout(()=>{if(win.__mwSettlementV25ConfirmArmed){win.confirm=previousConfirm;win.__mwSettlementV25ConfirmArmed=false}},15000);
    },true);
    win.__mwSettlementV25CloseBound=true;
  }

  function orderTable(rows,cur){
    if(!rows.length)return'<p class="empty">لا توجد طلبات مسلّمة محفوظة في Snapshot هذه الدورة.</p>';
    return `<table><thead><tr><th>#</th><th>الطلب</th><th>التاريخ</th><th>المنتج</th><th>الكمية</th><th>المبيعات</th><th>COGS</th><th>العمولات/أخرى</th><th>الربح</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.order_code||r.id)}</td><td>${esc(dateOnly(r.delivered_at))}</td><td>${esc(r.product_name||'—')}</td><td>${esc(r.quantity??1)}</td><td>${money(r.sales,r.currency||cur)}</td><td>${money(r.cogs,r.currency||cur)}</td><td>${money(r.fees,r.currency||cur)}</td><td><strong>${money(r.profit,r.currency||cur)}</strong></td></tr>`).join('')}</tbody></table>`;
  }
  function expenseTable(rows,cur){
    if(!rows.length)return'<p class="empty">لا توجد مصاريف محفوظة في Snapshot هذه الدورة.</p>';
    return `<table><thead><tr><th>#</th><th>التاريخ</th><th>النوع</th><th>البيان</th><th>المبلغ</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(dateOnly(r.expense_date))}</td><td>${esc(r.category||'مصروف')}</td><td>${esc(r.note||'—')}</td><td><strong>${money(r.amount,r.currency||cur)}</strong></td></tr>`).join('')}</tbody></table>`;
  }

  function printDetailed(win,x){
    if(!x)return;const snap=x.snapshot||{},orders=Array.isArray(snap.orders)?snap.orders:[],expenses=Array.isArray(snap.expenses)?snap.expenses:[];
    const st=(()=>{try{return JSON.parse(win.sessionStorage.getItem('meshwar_vendor_store')||'null')}catch{return null}})();
    const w=win.open('','_blank','width=1100,height=820');if(!w){win.alert?.('يرجى السماح بالنوافذ المنبثقة لفتح كشف الحساب.');return}
    const legacy=!Array.isArray(snap.orders)||!Array.isArray(snap.expenses),cur=x.currency||st?.default_currency||'USD';
    w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>كشف دورة مالية شامل</title><style>body{font-family:Arial,sans-serif;margin:0;padding:24px;background:#f3f4f6;color:#111827}.sheet{max-width:1050px;margin:auto;background:#fff;border:1px solid #d1d5db;border-radius:18px;padding:26px}.head{text-align:center;border-bottom:2px solid #d4af37;padding-bottom:14px}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:18px 0}.card{border:1px solid #d1d5db;border-radius:10px;padding:12px}.card span{display:block;color:#6b7280;font-size:12px}.card b{display:block;margin-top:5px;font-size:17px}.net{grid-column:1/-1;border-color:#d4af37}.section{margin-top:24px;break-inside:auto}.section h3{border-right:4px solid #d4af37;padding-right:9px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{padding:7px 5px;border:1px solid #e5e7eb;text-align:center}th{background:#f8fafc}.meta,.legacy{margin-top:14px;font-size:12px;color:#4b5563}.legacy{padding:10px;border:1px solid #f59e0b;background:#fffbeb;border-radius:8px}.empty{color:#6b7280}.actions{text-align:center;margin-bottom:14px}.actions button{border:0;border-radius:10px;background:#111827;color:#fff;padding:10px 18px;font-weight:800}@media print{body{background:#fff;padding:0}.sheet{border:0}.actions{display:none}thead{display:table-header-group}tr{break-inside:avoid}}</style></head><body><div class="actions"><button onclick="window.print()">طباعة / حفظ PDF</button></div><main class="sheet"><div class="head"><h2>MeshWar — كشف دورة مالية مغلقة</h2><h1>${esc(st?.store_name||'المتجر')}</h1><div>${esc(dateOnly(x.period_start))} → ${esc(dateOnly(x.period_end))}</div></div><section class="grid"><div class="card"><span>إجمالي المبيعات</span><b>${money(x.total_sales,cur)}</b></div><div class="card"><span>تكلفة البضاعة COGS</span><b>${money(x.total_cogs,cur)}</b></div><div class="card"><span>العمولات والخصومات</span><b>${money(x.total_commission_fees,cur)}</b></div><div class="card"><span>المصاريف التشغيلية</span><b>${money(x.total_operating_expenses,cur)}</b></div><div class="card net"><span>صافي الربح</span><b>${money(x.net_profit,cur)}</b></div></section>${legacy?'<div class="legacy">هذه دورة أُغلقت قبل تفعيل Snapshot التفصيلي؛ المجاميع التاريخية محفوظة كما هي، لكن تفاصيل الطلبات والمصاريف غير متاحة بأثر رجعي.</div>':`<section class="section"><h3>الطلبات المسلّمة الداخلة في الدورة (${orders.length})</h3>${orderTable(orders,cur)}</section><section class="section"><h3>المصاريف التشغيلية الداخلة في الدورة (${expenses.length})</h3>${expenseTable(expenses,cur)}</section>`}<div class="meta">الحالة: مغلق / Settled<br>تاريخ التقفيل: ${esc(new Date(x.closed_at).toLocaleString('en-US'))}<br>Snapshot: ${esc(snap.detail_version||snap.version||'legacy')} — الطلبات: ${esc(snap.order_count??orders.length)} — المصاريف: ${esc(snap.expense_count??expenses.length)}</div></main></body></html>`);w.document.close();
  }

  function bindPrintOverride(win){
    if(win.__mwSettlementV25PrintBound)return;
    win.document.addEventListener('click',e=>{
      const btn=e.target?.closest?.('[data-mw-settlement-print]');if(!btn)return;
      const row=(win.__mwSettlementV24Rows||[]).find(x=>String(x.id)===String(btn.dataset.mwSettlementPrint));
      if(!row)return;e.preventDefault();e.stopImmediatePropagation();printDetailed(win,row);
    },true);
    win.__mwSettlementV25PrintBound=true;
  }
  function install(win){if(!win)return;const boot=()=>{bindCloseEnrichment(win);bindPrintOverride(win);win.__mwVendorSettlementPdfDetailsV25=true};if(win.document.readyState==='loading')win.document.addEventListener('DOMContentLoaded',boot,{once:true});else boot()}
  window.MeshwarVendorSettlementPdfDetailsV25={install,snapshotDetails,enrichSettlementBody,printDetailed,VERSION};
})();
