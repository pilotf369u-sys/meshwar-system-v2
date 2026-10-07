/* MESHWAR_VENDOR_PL_EXPENSE_HOTFIX_V23 */
(function(){
  'use strict';
  const SB_URL='https://hsmmbloouskqdnptiiad.supabase.co';
  const SB_KEY='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
  const STORE_KEY='meshwar_vendor_store';
  const VERSION='20260823-1324';
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const money=(v,c='')=>`${num(v).toLocaleString('en-US',{maximumFractionDigits:2})} ${c||''}`.trim();
  const q=v=>encodeURIComponent(String(v??''));
  function store(win){try{return JSON.parse(win.sessionStorage.getItem(STORE_KEY)||'null')}catch{return null}}
  async function request(win,path,{method='GET',body=null,prefer='return=representation'}={}){const r=await win.fetch(`${SB_URL}/rest/v1/${path}`,{method,cache:'no-store',headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`,'Content-Type':'application/json',Accept:'application/json',...(method!=='GET'?{Prefer:prefer}:{})},body:body==null?null:JSON.stringify(body)});const t=await r.text();if(!r.ok)throw new Error(t||`HTTP ${r.status}`);return t?JSON.parse(t):null}
  function injectStyle(win){if(win.document.getElementById('mwExpenseV23Style'))return;const s=win.document.createElement('style');s.id='mwExpenseV23Style';s.textContent=`
    #vendorTab-pl .mw-pl-kpis{position:relative;z-index:1;clear:both}
    #vendorTab-pl .mw-expense-v23-card{position:relative!important;z-index:2!important;clear:both!important;margin-top:1rem!important;padding:1rem!important;border:1px solid rgba(212,175,55,.28)!important;border-radius:1rem!important;background:rgba(15,23,42,.42)!important;overflow:visible!important}
    .light #vendorTab-pl .mw-expense-v23-card{background:#f3f4f6!important;border-color:#d1d5db!important}
    #vendorTab-pl .mw-expense-v23-grid{display:grid!important;grid-template-columns:minmax(120px,.8fr) minmax(150px,1fr) minmax(180px,1.4fr) minmax(190px,auto)!important;gap:.65rem!important;align-items:end!important;position:relative!important;z-index:3!important;margin:0!important}
    #vendorTab-pl #mwExpenseAdd,#vendorTab-pl #mwPlRefresh{position:relative!important;z-index:4!important;pointer-events:auto!important;min-height:44px!important;white-space:nowrap!important}
    #vendorTab-pl #mwExpenseStatus{margin-top:.55rem;font-size:.76rem;font-weight:800;min-height:1.1rem}
    #vendorTab-pl #mwExpenseStatus[data-tone="ok"]{color:#34d399} #vendorTab-pl #mwExpenseStatus[data-tone="error"]{color:#f87171} #vendorTab-pl #mwExpenseStatus[data-tone="busy"]{color:#fbbf24}
    @media(max-width:900px){#vendorTab-pl .mw-expense-v23-grid{grid-template-columns:1fr 1fr!important}}@media(max-width:560px){#vendorTab-pl .mw-expense-v23-grid{grid-template-columns:1fr!important}}
  `;win.document.head.appendChild(s)}
  function arrange(win){const d=win.document,amount=d.getElementById('mwExpenseAmount');if(!amount)return;const grid=amount.closest('.grid');if(!grid||grid.dataset.mwExpenseV23)return;grid.dataset.mwExpenseV23='1';grid.classList.add('mw-expense-v23-grid');const card=d.createElement('section');card.className='mw-expense-v23-card';card.innerHTML='<div class="vendor-text mb-3 font-black">➕ إضافة مصروف تشغيلي</div>';grid.parentNode.insertBefore(card,grid);card.appendChild(grid);const status=d.createElement('div');status.id='mwExpenseStatus';status.setAttribute('aria-live','polite');card.appendChild(status)}
  function status(win,text,tone=''){const el=win.document.getElementById('mwExpenseStatus');if(el){el.textContent=text||'';el.dataset.tone=tone}}
  async function saveExpense(win,payload){
    try{return await request(win,'vendor_operating_expenses',{method:'POST',body:payload})}catch(directErr){
      console.warn('V23 direct expense insert failed; using RPC fallback',directErr);
      return request(win,'rpc/vendor_add_operating_expense',{method:'POST',body:{p_store_id:String(payload.store_id),p_amount:payload.amount,p_currency:payload.currency,p_category:payload.category,p_note:payload.note,p_expense_date:payload.expense_date}});
    }
  }
  async function fetchOperatingExpenses(win){
    const st=store(win);if(!st?.id)return[];const sid=String(st.id);
    try{
      const rpcRows=await request(win,'rpc/vendor_get_operating_expenses',{method:'POST',body:{p_store_id:sid}});
      if(Array.isArray(rpcRows))return rpcRows;
      if(rpcRows&&typeof rpcRows==='object')return[rpcRows];
    }catch(rpcErr){console.warn('V23 expense read RPC unavailable; falling back to direct read',rpcErr)}
    const rows=await request(win,`vendor_operating_expenses?select=*&store_id=eq.${q(sid)}&order=expense_date.desc,created_at.desc`);
    return Array.isArray(rows)?rows:[];
  }
  function renderExpenseState(win,expenses){
    const d=win.document,st=store(win),cur=st?.exchange_target_currency||st?.default_currency||'USD',rows=Array.isArray(expenses)?expenses:[];
    const total=rows.reduce((sum,x)=>sum+num(x.amount),0),last=win.__mwFinanceV21Last||{},baseProfit=num(last.net)+num(last.expenses),net=baseProfit-total;
    const expenseEl=d.getElementById('mwPlExpenses'),netEl=d.getElementById('mwPlNet'),list=d.getElementById('mwExpenseList');
    if(expenseEl)expenseEl.textContent=money(total,cur);if(netEl)netEl.textContent=money(net,cur);
    if(list)list.innerHTML=rows.length?rows.map(x=>`<div class="flex justify-between border-b border-white/10 py-2"><span>${esc(x.category||'مصروف')} — ${esc(x.note||'')}</span><strong>${money(x.amount,x.currency||cur)}</strong></div>`).join(''):'<div class="vendor-muted">لا توجد مصاريف تشغيلية مسجلة.</div>';
    win.__mwFinanceV21Last={...last,expenses:total,net};
    if(win.__mwFinanceV21Data)win.__mwFinanceV21Data.expenses=rows;
    return{total,net,rows};
  }
  async function refreshExpenseUi(win){
    const api=win.parent?.MeshwarVendorFinanceV21||win.MeshwarVendorFinanceV21;
    if(api?.refresh){try{await api.refresh(win,true)}catch(e){console.warn('V23 V21 refresh failed; continuing with expense-specific refresh',e)}}
    const expenses=await fetchOperatingExpenses(win);return renderExpenseState(win,expenses);
  }
  function schedulePersistentRefresh(win,delay=80){
    clearTimeout(win.__mwExpenseV23RefreshTimer);
    win.__mwExpenseV23RefreshTimer=setTimeout(()=>refreshExpenseUi(win).catch(e=>{console.error('V23 persistent expense refresh failed',e);status(win,'تعذر تحميل المصاريف المحفوظة: '+(e?.message||e),'error')}),delay);
  }
  async function submit(win,e){
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
    const d=win.document,st=store(win),btn=d.getElementById('mwExpenseAdd');if(!st?.id){status(win,'تعذر تحديد المتجر الحالي.','error');return}
    const raw=String(d.getElementById('mwExpenseAmount')?.value||'').trim(),amount=Number(raw),category=String(d.getElementById('mwExpenseCategory')?.value||'').trim(),note=String(d.getElementById('mwExpenseNote')?.value||'').trim();
    if(!Number.isFinite(amount)||amount<=0){status(win,'أدخل مبلغ مصروف أكبر من صفر.','error');d.getElementById('mwExpenseAmount')?.focus();return}
    if(btn?.dataset.busy==='1')return;const old=btn?.textContent||'+ إضافة مصروف تشغيلي';if(btn){btn.dataset.busy='1';btn.disabled=true;btn.textContent='جارٍ الحفظ…'}status(win,'جارٍ حفظ المصروف…','busy');
    try{
      const cur=st.exchange_target_currency||st.default_currency||'USD';
      await saveExpense(win,{store_id:String(st.id),amount,currency:cur,category:category||'تشغيلي',note:note||null,expense_date:new Date().toISOString().slice(0,10)});
      ['mwExpenseAmount','mwExpenseCategory','mwExpenseNote'].forEach(id=>{const el=d.getElementById(id);if(el)el.value=''});
      status(win,'تم الحفظ، جارٍ تحديث المصاريف…','busy');
      const refreshed=await refreshExpenseUi(win);
      status(win,`تمت إضافة المصروف وتحديث الإجمالي (${money(refreshed.total,cur)}).`,'ok');
    }catch(err){console.error('V23 expense submit failed',err);status(win,'تعذر حفظ أو تحديث المصروف: '+(err?.message||err),'error')}
    finally{if(btn){btn.dataset.busy='0';btn.disabled=false;btn.textContent=old}}
  }
  function bind(win){
    const d=win.document,btn=d.getElementById('mwExpenseAdd');
    if(btn&&!btn.dataset.mwExpenseV23){btn.addEventListener('click',e=>submit(win,e),true);btn.dataset.mwExpenseV23='1'}
    const refresh=d.getElementById('mwPlRefresh');
    if(refresh&&!refresh.dataset.mwExpenseV23){refresh.addEventListener('click',()=>schedulePersistentRefresh(win,120),false);refresh.dataset.mwExpenseV23='1'}
    const tab=d.getElementById('vendorTabBtn-pl');
    if(tab&&!tab.dataset.mwExpenseV23){tab.addEventListener('click',()=>schedulePersistentRefresh(win,140),false);tab.dataset.mwExpenseV23='1'}
  }
  function boot(win){injectStyle(win);arrange(win);bind(win);if(!win.__mwExpenseV23Observer){const ob=new win.MutationObserver(()=>{arrange(win);bind(win)});ob.observe(win.document.documentElement,{childList:true,subtree:true});win.__mwExpenseV23Observer=ob}win.__mwVendorPlExpenseV23=true;if(win.document.getElementById('vendorTab-pl')?.classList.contains('active'))schedulePersistentRefresh(win,160)}
  function install(win){if(!win)return;if(win.document.readyState==='loading')win.document.addEventListener('DOMContentLoaded',()=>boot(win),{once:true});else boot(win)}
  window.MeshwarVendorPlExpenseV23={install,submit,saveExpense,fetchOperatingExpenses,refreshExpenseUi,renderExpenseState,VERSION};
})();
