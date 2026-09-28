/* MESHWAR_VENDOR_FINANCE_PL_INVOICES_V21 */
(function(){
  'use strict';
  const SB_URL='https://hsmmbloouskqdnptiiad.supabase.co';
  const SB_KEY='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
  const STORE_KEY='meshwar_vendor_store';
  const VERSION='20260822-2316';

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
  const money=(v,c='')=>`${num(v).toLocaleString('en-US',{maximumFractionDigits:2})} ${c||''}`.trim();
  const q=v=>encodeURIComponent(String(v??''));
  function store(win){try{return JSON.parse(win.sessionStorage.getItem(STORE_KEY)||'null')}catch{return null}}
  function orderStoreId(o){return String(o?.details?.store_id||o?.store_id||'').trim()}
  function productName(o){return String(o?.details?.product_name||o?.product_name||'').trim()}
  function quantity(o){return Math.max(1,num(o?.details?.quantity||o?.quantity||1))}
  function isDelivered(o){const s=String(o?.status||'').trim().toLowerCase();return s==='تم التسليم'||s==='delivered'||s==='delivered_to_customer'}

  async function rest(win,path,{method='GET',body=null,prefer='return=representation'}={}){
    const r=await win.fetch(`${SB_URL}/rest/v1/${path}`,{
      method,cache:'no-store',
      headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`,'Content-Type':'application/json',Accept:'application/json',...(method!=='GET'?{Prefer:prefer}:{})},
      body:body==null?null:JSON.stringify(body)
    });
    const t=await r.text();if(!r.ok)throw new Error(t||`HTTP ${r.status}`);return t?JSON.parse(t):null;
  }

  function injectStyles(win){
    if(win.document.getElementById('mwFinanceV21Styles'))return;
    const s=win.document.createElement('style');s.id='mwFinanceV21Styles';s.textContent=`
      #vendorTab-pl .mw-pl-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:.75rem;margin:1rem 0}
      #vendorTab-pl .mw-pl-card{border:1px solid rgba(212,175,55,.22);border-radius:1rem;padding:1rem;background:rgba(15,23,42,.5)}
      .light #vendorTab-pl .mw-pl-card{background:#f3f4f6;border-color:#d1d5db;color:#0f172a}
      #vendorTab-pl .mw-pl-label{font-size:.72rem;color:#94a3b8;font-weight:800} .light #vendorTab-pl .mw-pl-label{color:#475569}
      #vendorTab-pl .mw-pl-value{margin-top:.35rem;font-size:1.08rem;font-weight:900}
      #vendorTab-pl .mw-pl-warning{border:1px solid rgba(245,158,11,.28);background:rgba(245,158,11,.10);color:#fbbf24;border-radius:.8rem;padding:.65rem .8rem;font-size:.75rem;font-weight:800}
      .light #vendorTab-pl .mw-pl-warning{color:#92400e;background:#fef3c7;border-color:#f59e0b}
      #mwProductCostPrice{direction:ltr;text-align:left}
      .mw-pl-table{width:100%;border-collapse:collapse}.mw-pl-table th,.mw-pl-table td{padding:.65rem;border-bottom:1px solid rgba(148,163,184,.16);text-align:center;font-size:.78rem}
      .mw-pl-action{border:1px solid rgba(212,175,55,.45);background:rgba(212,175,55,.14);color:#f8d66d;border-radius:.7rem;padding:.42rem .65rem;font-weight:900;cursor:pointer}
      .light .mw-pl-action{background:#d4af37;color:#111827;border-color:#9a7b17}
      @media(max-width:950px){#vendorTab-pl .mw-pl-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.mw-pl-table{display:block;overflow:auto;white-space:nowrap}}
    `;win.document.head.appendChild(s);
  }

  function injectCostField(win){
    const d=win.document;if(d.getElementById('mwProductCostPrice'))return;
    const base=d.getElementById('productBasePrice');if(!base)return;
    const input=d.createElement('input');input.id='mwProductCostPrice';input.className='field';input.type='number';input.min='0';input.step='0.01';input.placeholder='سعر التكلفة (اختياري)';input.setAttribute('aria-label','سعر التكلفة');
    base.insertAdjacentElement('afterend',input);
  }

  async function resolveProductId(win,{id,name,storeId}){
    if(id)return id;if(!name||!storeId)return'';
    const rows=await rest(win,`local_products?select=id&store_id=eq.${q(storeId)}&product_name=eq.${q(name)}&order=created_at.desc&limit=1`);
    return String((Array.isArray(rows)?rows[0]:null)?.id||'').trim();
  }
  async function persistCost(win,{id,name,storeId,cost}){
    const productId=await resolveProductId(win,{id,name,storeId});if(!productId)return;
    await rest(win,`local_products?id=eq.${q(productId)}&store_id=eq.${q(storeId)}`,{method:'PATCH',body:{cost_price:cost}});
  }
  async function hydrateCost(win,id){
    const st=store(win);if(!st?.id||!id)return;
    try{const rows=await rest(win,`local_products?select=id,cost_price&id=eq.${q(id)}&store_id=eq.${q(st.id)}&limit=1`);const p=Array.isArray(rows)?rows[0]:null;const el=win.document.getElementById('mwProductCostPrice');if(el)el.value=p?.cost_price==null?'':String(p.cost_price)}catch(e){console.warn('V21 cost hydrate failed',e)}
  }

  function wrapProductFunctions(win){
    injectCostField(win);
    const open=win.openProductModal;
    if(typeof open==='function'&&!open.__mwFinanceV21){
      const wrapped=function(){const r=open.apply(this,arguments);setTimeout(()=>{const el=win.document.getElementById('mwProductCostPrice');if(el&&!win.document.getElementById('productId')?.value)el.value=''},0);return r};
      wrapped.__mwFinanceV21=true;wrapped.__mwTaxonomyV10=open.__mwTaxonomyV10;wrapped.__mwBarcode=open.__mwBarcode;win.openProductModal=wrapped;
    }
    const edit=win.editProduct;
    if(typeof edit==='function'&&!edit.__mwFinanceV21){
      const wrapped=function(id){const r=edit.apply(this,arguments);setTimeout(()=>hydrateCost(win,id),0);setTimeout(()=>hydrateCost(win,id),180);return r};
      wrapped.__mwFinanceV21=true;wrapped.__mwTaxonomyV10=edit.__mwTaxonomyV10;wrapped.__mwBarcode=edit.__mwBarcode;win.editProduct=wrapped;
    }
    const save=win.saveProduct;
    if(typeof save==='function'&&!save.__mwFinanceV21){
      const wrapped=async function(){
        const st=store(win),id=String(win.document.getElementById('productId')?.value||'').trim(),name=String(win.document.getElementById('productName')?.value||'').trim();
        const raw=String(win.document.getElementById('mwProductCostPrice')?.value||'').trim();const cost=raw===''?null:Math.max(0,num(raw));
        const r=await save.apply(this,arguments);
        if(st?.id&&name){try{await persistCost(win,{id,name,storeId:String(st.id),cost});scheduleRefresh(win)}catch(e){console.error('V21 cost persistence failed',e);win.alert?.('تم حفظ المنتج، لكن تعذر حفظ سعر التكلفة: '+(e?.message||e))}}
        return r;
      };
      wrapped.__mwFinanceV21=true;wrapped.__mwTaxonomyV10=save.__mwTaxonomyV10;win.saveProduct=wrapped;
    }
  }

  function activatePl(win){
    const d=win.document;d.querySelectorAll('.vendor-main-tab').forEach(x=>x.classList.remove('active'));d.querySelectorAll('.vendor-tab-panel').forEach(x=>x.classList.remove('active'));
    d.getElementById('vendorTabBtn-pl')?.classList.add('active');d.getElementById('vendorTab-pl')?.classList.add('active');refresh(win,true).catch(e=>console.error('V21 P&L refresh failed',e));
  }

  function injectPlUi(win){
    const d=win.document,nav=d.querySelector('.vendor-main-tabs');if(!nav)return;
    if(!d.getElementById('vendorTabBtn-pl')){
      const b=d.createElement('button');b.id='vendorTabBtn-pl';b.type='button';b.className='vendor-main-tab';b.textContent='📈 الأرباح والخسائر';b.addEventListener('click',()=>activatePl(win));nav.appendChild(b);
    }
    if(d.getElementById('vendorTab-pl'))return;
    const panel=d.createElement('section');panel.id='vendorTab-pl';panel.className='vendor-tab-panel';panel.innerHTML=`
      <div class="glass rounded-3xl p-4 md:p-6">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 class="vendor-text text-xl font-black">الأرباح والخسائر (P&L)</h2><p class="vendor-muted mt-1 text-xs text-slate-400">يُحتسب من الطلبات المسلّمة فقط. تكلفة الطلب المثبتة لها الأولوية، والطلبات القديمة تبقى دون تعديل.</p></div><button id="mwPlRefresh" class="mw-pl-action">تحديث</button></div>
        <div class="mw-pl-kpis">
          <div class="mw-pl-card"><div class="mw-pl-label">مبيعات مسلّمة</div><div id="mwPlSales" class="mw-pl-value">0</div></div>
          <div class="mw-pl-card"><div class="mw-pl-label">تكلفة البضاعة COGS</div><div id="mwPlCogs" class="mw-pl-value">0</div></div>
          <div class="mw-pl-card"><div class="mw-pl-label">العمولة + الخصومات</div><div id="mwPlFees" class="mw-pl-value">0</div></div>
          <div class="mw-pl-card"><div class="mw-pl-label">المصاريف التشغيلية</div><div id="mwPlExpenses" class="mw-pl-value">0</div></div>
          <div class="mw-pl-card"><div class="mw-pl-label">صافي الربح</div><div id="mwPlNet" class="mw-pl-value">0</div></div>
        </div>
        <div id="mwPlWarning" class="mw-pl-warning hidden"></div>
        <div class="mt-4 grid gap-2 md:grid-cols-4">
          <input id="mwExpenseAmount" class="field" type="number" min="0" step="0.01" placeholder="المبلغ">
          <input id="mwExpenseCategory" class="field" placeholder="نوع المصروف">
          <input id="mwExpenseNote" class="field" placeholder="ملاحظة">
          <button id="mwExpenseAdd" class="mw-pl-action">+ إضافة مصروف تشغيلي</button>
        </div>
        <h3 class="vendor-text mt-6 mb-2 font-black">ربحية الطلبات المسلّمة والفواتير</h3>
        <div class="vendor-table-wrap"><table class="mw-pl-table"><thead><tr><th>الطلب</th><th>المبيعات</th><th>تكلفة البضاعة</th><th>العمولة/أخرى</th><th>ربح الطلب</th><th>الفاتورة</th></tr></thead><tbody id="mwPlOrdersBody"></tbody></table></div>
        <h3 class="vendor-text mt-6 mb-2 font-black">المصاريف التشغيلية</h3><div id="mwExpenseList" class="text-sm"></div>
      </div>`;
    (d.querySelector('main')||d.body).appendChild(panel);
    d.getElementById('mwPlRefresh')?.addEventListener('click',()=>refresh(win,true));
    d.getElementById('mwExpenseAdd')?.addEventListener('click',()=>addExpense(win));
  }

  function orderCost(o,products){
    if(o.snapshot_cost_price!=null)return{unit:num(o.snapshot_cost_price),source:'snapshot'};
    if(o.cost_price!=null)return{unit:num(o.cost_price),source:'order'};
    const byId=String(o?.details?.product_id||'');const name=productName(o);
    const p=products.find(x=>byId&&String(x.id)===byId)||products.find(x=>String(x.product_name||'')===name);
    if(p?.cost_price!=null)return{unit:num(p.cost_price),source:'estimate'};
    return{unit:0,source:'missing'};
  }
  function orderMetrics(o,products,commissionDefault){
    const sales=num(o.total_price),rate=num(o?.details?.commission_rate??commissionDefault),commission=sales*rate/100,other=num(o?.details?.vendor_other_deductions),cost=orderCost(o,products),cogs=cost.unit*quantity(o),profit=sales-commission-other-cogs;
    return{sales,rate,commission,other,cogs,profit,costSource:cost.source};
  }

  async function loadData(win){
    const st=store(win);if(!st?.id)return{st:null,orders:[],products:[],expenses:[]};const sid=String(st.id);
    const [orders,products,expenses]=await Promise.all([
      rest(win,`orders?select=*&order=created_at.desc`),
      rest(win,`local_products?select=id,store_id,product_name,cost_price&store_id=eq.${q(sid)}`),
      rest(win,`vendor_operating_expenses?select=*&store_id=eq.${q(sid)}&order=expense_date.desc`)
    ]);
    return{st,orders:(orders||[]).filter(o=>orderStoreId(o)===sid&&isDelivered(o)),products:products||[],expenses:expenses||[]};
  }

  function render(win,data){
    const d=win.document,{st,orders,products,expenses}=data;if(!st)return;const cur=st.exchange_target_currency||st.default_currency||'USD';let sales=0,cogs=0,fees=0,orderProfit=0,missing=0,estimated=0;
    const rows=orders.map(o=>{const m=orderMetrics(o,products,st.commission_rate??10);sales+=m.sales;cogs+=m.cogs;fees+=m.commission+m.other;orderProfit+=m.profit;if(m.costSource==='missing')missing++;if(m.costSource==='estimate')estimated++;
      const marker=m.costSource==='snapshot'?'🔒':m.costSource==='estimate'?'≈':'—';return `<tr><td>${esc(o.order_code||o.id)}</td><td>${money(m.sales,cur)}</td><td>${marker} ${money(m.cogs,cur)}</td><td>${money(m.commission+m.other,cur)}</td><td>${money(m.profit,cur)}</td><td><button class="mw-pl-action" data-mw-invoice="${esc(o.id)}">فاتورة</button></td></tr>`}).join('');
    const op=expenses.reduce((a,x)=>a+num(x.amount),0),net=orderProfit-op;
    const set=(id,v)=>{const el=d.getElementById(id);if(el)el.textContent=money(v,cur)};set('mwPlSales',sales);set('mwPlCogs',cogs);set('mwPlFees',fees);set('mwPlExpenses',op);set('mwPlNet',net);
    const body=d.getElementById('mwPlOrdersBody');if(body)body.innerHTML=rows||'<tr><td colspan="6">لا توجد طلبات مسلّمة.</td></tr>';
    body?.querySelectorAll('[data-mw-invoice]').forEach(b=>b.addEventListener('click',()=>openInvoice(win,orders.find(o=>String(o.id)===String(b.dataset.mwInvoice)),products,st)));
    const list=d.getElementById('mwExpenseList');if(list)list.innerHTML=expenses.length?expenses.map(x=>`<div class="flex justify-between border-b border-white/10 py-2"><span>${esc(x.category||'مصروف')} — ${esc(x.note||'')}</span><strong>${money(x.amount,x.currency||cur)}</strong></div>`).join(''):'<div class="vendor-muted">لا توجد مصاريف تشغيلية مسجلة.</div>';
    const warning=d.getElementById('mwPlWarning');if(warning){const msgs=[];if(estimated)msgs.push(`${estimated} طلب قديم يستخدم سعر التكلفة الحالي كتقدير دون تغيير بيانات الطلب.`);if(missing)msgs.push(`${missing} طلب لا يملك تكلفة مثبتة أو تكلفة منتج؛ ربحه محسوب بتكلفة 0 لحين إدخال التكلفة.`);warning.textContent=msgs.join(' ');warning.classList.toggle('hidden',!msgs.length)}
    win.__mwFinanceV21Last={sales,cogs,fees,expenses:op,net,deliveredCount:orders.length,missing,estimated};
  }

  async function refresh(win,force=false){
    if(win.__mwFinanceV21RefreshPromise&&!force)return win.__mwFinanceV21RefreshPromise;
    win.__mwFinanceV21RefreshPromise=(async()=>{try{const data=await loadData(win);win.__mwFinanceV21Data=data;render(win,data)}finally{win.__mwFinanceV21RefreshPromise=null}})();return win.__mwFinanceV21RefreshPromise;
  }
  function scheduleRefresh(win){clearTimeout(win.__mwFinanceV21RefreshTimer);win.__mwFinanceV21RefreshTimer=setTimeout(()=>refresh(win,true).catch(e=>console.warn('V21 refresh failed',e)),180)}

  async function addExpense(win){
    const d=win.document,st=store(win);if(!st?.id)return;const amount=num(d.getElementById('mwExpenseAmount')?.value),category=String(d.getElementById('mwExpenseCategory')?.value||'').trim(),note=String(d.getElementById('mwExpenseNote')?.value||'').trim();if(!(amount>0)){win.alert?.('أدخل مبلغ مصروف أكبر من صفر.');return}
    const cur=st.exchange_target_currency||st.default_currency||'USD';await rest(win,'vendor_operating_expenses',{method:'POST',body:{store_id:st.id,amount,currency:cur,category:category||'تشغيلي',note:note||null,expense_date:new Date().toISOString().slice(0,10)}});d.getElementById('mwExpenseAmount').value='';d.getElementById('mwExpenseCategory').value='';d.getElementById('mwExpenseNote').value='';await refresh(win,true);
  }

  function openInvoice(win,o,products,st){
    if(!o)return;const m=orderMetrics(o,products,st.commission_rate??10),cur=o.currency||st.exchange_target_currency||st.default_currency||'USD',code=o.order_code||o.id,w=win.open('','_blank','width=900,height=760');if(!w){win.alert?.('يرجى السماح بالنوافذ المنبثقة لفتح الفاتورة.');return}
    w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>فاتورة ${esc(code)}</title><style>body{font-family:Arial,sans-serif;background:#f3f4f6;color:#111827;margin:0;padding:24px}.invoice{max-width:800px;margin:auto;background:#fff;border:1px solid #d1d5db;border-radius:18px;padding:28px}.head{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #d4af37;padding-bottom:16px}.edit{outline:1px dashed #d4af37;border-radius:6px;padding:4px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:20px 0}.row{display:flex;justify-content:space-between;border-bottom:1px solid #e5e7eb;padding:9px}.actions{display:flex;gap:8px;margin:0 auto 16px;max-width:800px}.actions button{border:0;border-radius:10px;padding:10px 16px;font-weight:700;cursor:pointer}.print{background:#0f172a;color:#fff}.note{min-height:70px;border:1px dashed #d4af37;padding:10px;border-radius:10px}@media print{.actions{display:none}body{background:#fff;padding:0}.invoice{border:0}}</style></head><body><div class="actions"><button class="print" onclick="window.print()">🖨️ طباعة / حفظ PDF</button></div><div class="invoice"><div class="head"><div><h1 contenteditable="true" class="edit">فاتورة MeshWar</h1><div contenteditable="true" class="edit">${esc(st.store_name||'المتجر')}</div></div><div><strong>${esc(code)}</strong><div>${new Date(o.created_at).toLocaleDateString('en-US')}</div></div></div><div class="grid"><div class="row"><span>المنتج</span><strong contenteditable="true" class="edit">${esc(productName(o)||'—')}</strong></div><div class="row"><span>الكمية</span><strong>${quantity(o)}</strong></div><div class="row"><span>إجمالي البيع</span><strong>${money(m.sales,cur)}</strong></div><div class="row"><span>تكلفة البضاعة</span><strong>${money(m.cogs,cur)}</strong></div><div class="row"><span>العمولة/أخرى</span><strong>${money(m.commission+m.other,cur)}</strong></div><div class="row"><span>ربح الطلب</span><strong>${money(m.profit,cur)}</strong></div></div><h3>ملاحظات قابلة للتحرير</h3><div class="note" contenteditable="true">أضف ملاحظات الفاتورة هنا قبل الطباعة أو الحفظ PDF.</div></div></body></html>`);w.document.close();
  }

  function install(win){
    if(!win||win.__mwFinanceV21Installed)return;const boot=()=>{
      injectStyles(win);injectCostField(win);injectPlUi(win);wrapProductFunctions(win);
      if(!win.__mwFinanceV21WrapTimer)win.__mwFinanceV21WrapTimer=setInterval(()=>{injectCostField(win);injectPlUi(win);wrapProductFunctions(win)},120);
      if(!win.__mwFinanceV21Observer){const ob=new win.MutationObserver(()=>{injectCostField(win);injectPlUi(win);wrapProductFunctions(win)});ob.observe(win.document.documentElement,{childList:true,subtree:true});win.__mwFinanceV21Observer=ob}
      win.__mwFinanceV21Installed=true;
    };if(win.document.readyState==='loading')win.document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  }

  window.MeshwarVendorFinanceV21={install,refresh,openInvoice,orderMetrics,version:VERSION};
})();
