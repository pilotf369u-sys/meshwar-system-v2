from pathlib import Path

p = Path('branch-dashboard.html')
s = p.read_text(encoding='utf-8')

if 'BRANCH_LUXURY_UI_V1' in s:
    raise SystemExit('luxury patch already applied')

# Tailwind utilities without preflight so existing operational markup is untouched.
head_marker = '<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>لوحة تحكم الفرع - MeshWar</title>'
head_insert = head_marker + '''\n<script src="https://cdn.tailwindcss.com"></script>\n<script>tailwind.config={corePlugins:{preflight:false},darkMode:'class'}</script>'''
if head_marker not in s:
    raise SystemExit('head marker not found')
s = s.replace(head_marker, head_insert, 1)

css_marker = '</style><script src="https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"></script></head>'
luxury_css = r'''</style>
<style id="branchLuxuryTheme">
/* BRANCH_LUXURY_UI_V1 — visual layer only; operational IDs/functions stay unchanged */
:root{color-scheme:dark;--branch-bg:#020617;--branch-panel:rgba(15,23,42,.76);--branch-panel-2:rgba(30,41,59,.66);--branch-line:rgba(255,255,255,.09);--branch-gold:#fbbf24;--branch-gold-soft:rgba(251,191,36,.16);--branch-sky:#38bdf8;--branch-text:#e5e7eb;--branch-muted:#94a3b8}
html{background:var(--branch-bg)}
body{min-height:100vh;background:radial-gradient(circle at 12% 8%,rgba(14,165,233,.12),transparent 30%),radial-gradient(circle at 88% 10%,rgba(251,191,36,.10),transparent 26%),linear-gradient(145deg,#020617 0%,#071226 48%,#020617 100%)!important;color:var(--branch-text)!important;padding:22px!important}
.container{max-width:1560px!important;background:rgba(2,6,23,.42)!important;border:1px solid rgba(251,191,36,.14)!important;border-radius:28px!important;padding:24px!important;box-shadow:0 30px 90px rgba(0,0,0,.38),inset 0 1px rgba(255,255,255,.04)!important;backdrop-filter:blur(18px)}
h2,h3{color:#f8fafc!important}.top{padding:18px 20px;border:1px solid var(--branch-line);border-radius:22px;background:linear-gradient(135deg,rgba(15,23,42,.84),rgba(30,41,59,.62));box-shadow:0 18px 48px rgba(0,0,0,.20),0 0 0 1px rgba(251,191,36,.04)}.top .muted,.muted{color:var(--branch-muted)!important}
.section-title{background:linear-gradient(90deg,rgba(15,23,42,.96),rgba(30,41,59,.82))!important;color:#fff!important;border:1px solid rgba(251,191,36,.24)!important;border-radius:16px!important;padding:13px 16px!important;box-shadow:0 10px 28px rgba(0,0,0,.17),inset 3px 0 rgba(251,191,36,.75)!important}
.toolbar{background:rgba(15,23,42,.74)!important;border:1px solid var(--branch-line)!important;border-radius:18px!important;padding:12px!important;box-shadow:inset 0 1px rgba(255,255,255,.025)}
input,select{background:rgba(2,6,23,.72)!important;color:#e2e8f0!important;border:1px solid rgba(148,163,184,.25)!important;border-radius:11px!important;padding:9px 10px!important;outline:none!important;transition:.2s ease}input:focus,select:focus{border-color:rgba(251,191,36,.62)!important;box-shadow:0 0 0 3px rgba(251,191,36,.10)!important}select option{background:#0f172a;color:#e5e7eb}
button,a.btn{border-radius:11px!important;border:1px solid rgba(255,255,255,.10)!important;padding:9px 13px!important;box-shadow:0 8px 18px rgba(0,0,0,.14)!important;transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease!important}button:hover,a.btn:hover{transform:translateY(-1px);border-color:rgba(251,191,36,.45)!important;box-shadow:0 10px 24px rgba(251,191,36,.08)!important}.green{background:linear-gradient(135deg,#059669,#047857)!important}.blue{background:linear-gradient(135deg,#0284c7,#2563eb)!important}.orange{background:linear-gradient(135deg,#d97706,#b45309)!important}.purple{background:linear-gradient(135deg,#7c3aed,#4f46e5)!important}.red{background:linear-gradient(135deg,#e11d48,#be123c)!important}.gray{background:#475569!important}
table{border-collapse:separate!important;border-spacing:0!important;background:rgba(15,23,42,.58)!important;border:1px solid var(--branch-line)!important;border-radius:18px!important;overflow:hidden!important;box-shadow:0 16px 42px rgba(0,0,0,.16)!important}th,td{border:0!important;border-bottom:1px solid rgba(255,255,255,.07)!important;padding:11px 10px!important;color:#dbeafe!important}th{position:sticky;top:0;background:linear-gradient(180deg,#162033,#0f172a)!important;color:#f8fafc!important;font-size:12px!important;letter-spacing:.01em}tbody tr{transition:background .18s ease}tbody tr:hover{background:rgba(56,189,248,.055)!important}.selected-row{background:rgba(251,191,36,.10)!important}.customer-code,.money-chip,.collect{background:rgba(251,191,36,.10)!important;color:#fde68a!important;border:1px solid rgba(251,191,36,.20)!important}.secondary-phone{color:#fbbf24!important}.contact-mini a{background:rgba(56,189,248,.12)!important;color:#bae6fd!important}
.account-grid{gap:12px!important}.account-card{background:linear-gradient(145deg,rgba(15,23,42,.86),rgba(30,41,59,.62))!important;color:#e5e7eb!important;border:1px solid rgba(251,191,36,.16)!important;border-radius:18px!important;padding:14px!important;box-shadow:0 12px 34px rgba(0,0,0,.16)!important}
.modal{background:rgba(2,6,23,.82)!important;backdrop-filter:blur(12px)}.modal-content{background:linear-gradient(145deg,#0f172a,#111c31)!important;color:#e5e7eb!important;border:1px solid rgba(251,191,36,.22)!important;border-radius:22px!important;box-shadow:0 30px 80px rgba(0,0,0,.48)!important}.close{color:#cbd5e1!important}.scan-card.ok{background:rgba(6,78,59,.35)!important;border-color:rgba(52,211,153,.40)!important;color:#d1fae5!important}.scan-card.fail{background:rgba(127,29,29,.35)!important;border-color:rgba(251,113,133,.35)!important;color:#ffe4e6!important}.scan-item{background:rgba(15,23,42,.72)!important;border-color:rgba(255,255,255,.09)!important;color:#e5e7eb!important}.scan-code{background:#020617!important;border-color:rgba(251,191,36,.45)!important;color:#fef3c7!important}.dashboard-scanner-panel,#scannerModal .modal-content{background:linear-gradient(145deg,#0f172a,#111827)!important;color:#e5e7eb!important;border:1px solid rgba(251,191,36,.25)!important}.dashboard-camera-hint,#cameraHint{color:#cbd5e1!important}#reader{background:#020617!important;border:1px solid rgba(255,255,255,.08)!important}
.pager button{background:rgba(30,41,59,.92)!important}.pager .active{background:linear-gradient(135deg,#f59e0b,#d97706)!important;color:#111827!important;border-color:#fde68a!important}
.branch-luxury-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:18px 0}.branch-stat-card{position:relative;overflow:hidden;min-height:108px;padding:16px 17px;border-radius:20px;background:linear-gradient(145deg,rgba(15,23,42,.88),rgba(30,41,59,.62));border:1px solid rgba(255,255,255,.08);box-shadow:0 14px 38px rgba(0,0,0,.18)}.branch-stat-card:before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:linear-gradient(#fde68a,#f59e0b);box-shadow:0 0 16px rgba(251,191,36,.65)}.branch-stat-label{font-size:12px;color:#94a3b8;font-weight:800}.branch-stat-value{margin-top:9px;font-size:31px;line-height:1;font-weight:900;color:#f8fafc}.branch-stat-icon{position:absolute;left:14px;top:13px;font-size:24px;filter:drop-shadow(0 0 9px rgba(251,191,36,.2))}.branch-stat-note{margin-top:8px;font-size:10px;color:#64748b}.branch-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:4px 0 16px;padding:8px;border-radius:16px;background:rgba(15,23,42,.62);border:1px solid rgba(255,255,255,.07)}.branch-tab{background:rgba(255,255,255,.045)!important;color:#cbd5e1!important;border:1px solid rgba(255,255,255,.08)!important}.branch-tab.active{background:linear-gradient(135deg,rgba(2,132,199,.35),rgba(79,70,229,.38))!important;color:#fff!important;border-color:rgba(251,191,36,.55)!important;box-shadow:0 0 0 1px rgba(251,191,36,.08),0 10px 26px rgba(251,191,36,.09)!important}.branch-quick-actions{display:flex;gap:5px;flex-wrap:wrap;justify-content:center;margin-top:7px;padding-top:7px;border-top:1px solid rgba(255,255,255,.06)}.branch-quick-actions button{font-size:10px!important;padding:6px 8px!important;white-space:nowrap}.branch-action-receive{background:#065f46!important}.branch-action-transfer{background:#92400e!important}.branch-action-courier{background:#1d4ed8!important}
@media(max-width:1050px){.branch-luxury-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.container{padding:15px!important}}
@media(max-width:640px){body{padding:10px!important}.container{border-radius:18px!important;padding:10px!important}.branch-luxury-stats{grid-template-columns:1fr 1fr;gap:8px}.branch-stat-card{min-height:90px;padding:13px}.branch-stat-value{font-size:25px}.branch-tabs{position:sticky;top:4px;z-index:40;overflow-x:auto;flex-wrap:nowrap}.branch-tab{white-space:nowrap}.toolbar{align-items:stretch}.toolbar input,.toolbar select{flex:1 1 150px}.top{padding:14px}.modal-content{width:92%!important;margin:3% auto!important;padding:14px!important}th,td{font-size:11px!important;padding:8px 7px!important}}
</style><script src="https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"></script></head>'''
if css_marker not in s:
    raise SystemExit('css marker not found')
s = s.replace(css_marker, luxury_css, 1)

# Add live summary cards + glass tabs after the untouched operational header.
insert_before = '<div class="section-title">📦 إدارة شحنات الفرع</div>'
new_ui = r'''<section class="branch-luxury-stats" aria-label="ملخص عمليات الفرع">
  <article class="branch-stat-card"><span class="branch-stat-icon">📦</span><div class="branch-stat-label">إجمالي الطرود بالفرع</div><div id="branchStatTotal" class="branch-stat-value">—</div><div class="branch-stat-note">كل الشحنات المرتبطة بالفرع</div></article>
  <article class="branch-stat-card"><span class="branch-stat-icon">📥</span><div class="branch-stat-label">الطرود الواردة</div><div id="branchStatIncoming" class="branch-stat-value">—</div><div class="branch-stat-note">محولة للفرع / تم شحنها</div></article>
  <article class="branch-stat-card"><span class="branch-stat-icon">🔁</span><div class="branch-stat-label">الطرود الصادرة</div><div id="branchStatOutgoing" class="branch-stat-value">—</div><div class="branch-stat-note">قيد التحويل الداخلي</div></article>
  <article class="branch-stat-card"><span class="branch-stat-icon">🚚</span><div class="branch-stat-label">مع المناديب</div><div id="branchStatCourier" class="branch-stat-value">—</div><div class="branch-stat-note">قيد التوصيل الميداني</div></article>
</section>
<nav class="branch-tabs" aria-label="تبويبات عمليات الفرع">
  <button type="button" class="branch-tab active" data-branch-tab="current" onclick="branchLuxuryTab('current',this)">📦 الطرود الحالية</button>
  <button type="button" class="branch-tab" data-branch-tab="branches" onclick="branchLuxuryTab('branches',this)">🔁 شحنات الفروع</button>
  <button type="button" class="branch-tab" data-branch-tab="couriers" onclick="branchLuxuryTab('couriers',this)">🚚 تسليم المناديب</button>
  <button type="button" class="branch-tab" data-branch-tab="history" onclick="branchLuxuryTab('history',this)">📜 السجل</button>
</nav>
<div id="branchOrdersSection" class="section-title">📦 إدارة شحنات الفرع</div>'''
if insert_before not in s:
    raise SystemExit('orders section marker not found')
s = s.replace(insert_before, new_ui, 1)
s = s.replace('<div class="section-title">💰 محاسبة المندوبين والذمم المالية</div>', '<div id="branchCourierSection" class="section-title">💰 محاسبة المندوبين والذمم المالية</div>', 1)

# Append UI-only helper: read-only counts, tab shortcuts, and quick actions that reuse existing saveOrder/status/courier controls.
body_marker = '</body>'
helper = r'''
<script>
/* BRANCH_LUXURY_UI_HELPERS_V1 — presentation helpers only; reuses existing Supabase/getSb/saveOrder APIs */
(function(){
  const setText=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=Number(value||0).toLocaleString('en-US')};
  async function refreshStats(){
    try{
      if(!currentBranch||typeof getSb!=='function')return;
      const c=await getSb(),bid=cloudId(currentBranch.id);
      const countFor=async statuses=>{let q=c.from('orders').select('id',{count:'exact',head:true}).eq('branch_id',bid);if(statuses?.length===1)q=q.eq('status',statuses[0]);else if(statuses?.length>1)q=q.in('status',statuses);const{count,error}=await q;if(error)throw error;return count||0};
      const [all,incoming,outgoing,courier]=await Promise.all([
        countFor(),countFor(['محولة إلى الفرع','تم الشحن']),countFor(['توزيع داخلي']),countFor(['مندوب','جاري التوصيل مع المندوب'])
      ]);
      setText('branchStatTotal',all);setText('branchStatIncoming',incoming);setText('branchStatOutgoing',outgoing);setText('branchStatCourier',courier);
    }catch(e){console.warn('Branch luxury stats:',e)}
  }
  function activate(btn){document.querySelectorAll('.branch-tab').forEach(x=>x.classList.remove('active'));btn?.classList.add('active')}
  window.branchLuxuryTab=function(kind,btn){
    activate(btn);
    if(kind==='history'){if(typeof openSettlementHistoryModal==='function')openSettlementHistoryModal();return}
    const filter=document.getElementById('statusFilter');
    if(filter){filter.value=kind==='branches'?'محولة إلى الفرع':kind==='couriers'?'مندوب':'';}
    if(typeof resetPage==='function')resetPage();
    document.getElementById(kind==='couriers'?'branchCourierSection':'branchOrdersSection')?.scrollIntoView({behavior:'smooth',block:'start'});
  };
  window.branchQuickReceive=function(id){const enc=encodeURIComponent(cloudId(id)),st=document.getElementById('st-'+enc);if(st){st.value='مخزن محلي';saveOrder(id)}};
  window.branchQuickTransfer=function(id){const enc=encodeURIComponent(cloudId(id)),st=document.getElementById('st-'+enc);if(st){st.value='توزيع داخلي';saveOrder(id)}};
  window.branchQuickCourier=function(id){const enc=encodeURIComponent(cloudId(id)),cr=document.getElementById('cr-'+enc),st=document.getElementById('st-'+enc);if(!cr?.value)return alert('اختر مندوباً أولاً من قائمة المندوب في نفس الصف.');if(st)st.value='مندوب';saveOrder(id)};
  function decorateQuickActions(){
    const rows=[...document.querySelectorAll('#ordersBody tr')].filter(tr=>tr.querySelectorAll('td').length>1);
    rows.forEach((tr,i)=>{if(tr.dataset.luxuryActions==='1')return;const o=orders?.[i];if(!o)return;tr.dataset.luxuryActions='1';const cell=tr.querySelectorAll('td')[8];if(!cell)return;const id=cloudId(o.id),encoded=encodeURIComponent(id);cell.insertAdjacentHTML('beforeend',`<div class="branch-quick-actions"><button type="button" class="branch-action-receive" onclick="branchQuickReceive(decodeURIComponent('${encoded}'))">✓ استلام بالفرع</button><button type="button" class="branch-action-transfer" onclick="branchQuickTransfer(decodeURIComponent('${encoded}'))">⇄ تحويل لفرع آخر</button><button type="button" class="branch-action-courier" onclick="branchQuickCourier(decodeURIComponent('${encoded}'))">🚚 تسليم لمندوب</button></div>`)});
  }
  if(typeof loadOrders==='function'){
    const baseLoadOrders=loadOrders;
    loadOrders=async function(...args){const r=await baseLoadOrders(...args);decorateQuickActions();refreshStats();return r};window.loadOrders=loadOrders;
  }
  const start=()=>{decorateQuickActions();refreshStats();};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
</script>
'''
if body_marker not in s:
    raise SystemExit('body marker not found')
s = s.replace(body_marker, helper + body_marker, 1)

p.write_text(s, encoding='utf-8')
