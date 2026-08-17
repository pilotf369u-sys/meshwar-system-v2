from pathlib import Path

# Vendor realtime subscription — refresh only this vendor's local orders.
p = Path('vendor-dashboard.html')
s = p.read_text(encoding='utf-8')
old = "function vendorLogout(){sessionStorage.removeItem('meshwar_vendor_store');vendorStore=null;location.reload()}"
new = "function vendorLogout(){try{if(vendorOrdersRealtime)sb.removeChannel(vendorOrdersRealtime)}catch(e){console.warn('Vendor realtime cleanup:',e)}sessionStorage.removeItem('meshwar_vendor_store');vendorStore=null;location.reload()}"
if old not in s:
    raise SystemExit('vendorLogout marker not found')
s = s.replace(old, new, 1)
old = "async function openDashboard(){if(!vendorStore)return;$('loginView').classList.add('hidden');$('dashboardView').classList.remove('hidden');$('storeName').textContent=vendorStore.store_name||'المتجر';$('storeMeta').textContent=[vendorStore.specialty,vendorStore.governorate].filter(Boolean).join(' • ');$('storeLogo').src=vendorStore.logo_url||PLACEHOLDER;$('storeLogo').onerror=()=>{$('storeLogo').src=PLACEHOLDER};$('exchangeRate').value=vendorStore.exchange_rate||1;$('exchangeBase').value='USD';$('exchangeTarget').value=vendorStore.exchange_target_currency||'IQD';renderExchangePreview();await Promise.all([loadProducts(),loadOrders(),loadFinance()])}"
new = "async function openDashboard(){if(!vendorStore)return;$('loginView').classList.add('hidden');$('dashboardView').classList.remove('hidden');$('storeName').textContent=vendorStore.store_name||'المتجر';$('storeMeta').textContent=[vendorStore.specialty,vendorStore.governorate].filter(Boolean).join(' • ');$('storeLogo').src=vendorStore.logo_url||PLACEHOLDER;$('storeLogo').onerror=()=>{$('storeLogo').src=PLACEHOLDER};$('exchangeRate').value=vendorStore.exchange_rate||1;$('exchangeBase').value='USD';$('exchangeTarget').value=vendorStore.exchange_target_currency||'IQD';renderExchangePreview();await Promise.all([loadProducts(),loadOrders(),loadFinance()]);await setupVendorOrdersRealtime()}"
if old not in s:
    raise SystemExit('openDashboard marker not found')
s = s.replace(old, new, 1)
marker = "Object.assign(window,{vendorLogin,vendorLogout,toggleTheme,openProductModal,closeProductModal,editProduct,saveProduct,deleteProduct,saveExchangeRate,loadOrders,printShippingLabel,openVendorOrderDetails,closeVendorOrderDetails,setVendorTab,setVendorOrderFilter,setVendorFinanceFilter,exportVendorPaidStatement});"
realtime = r'''let vendorOrdersRealtime=null,vendorRealtimeRefreshTimer=null;
function scheduleVendorRealtimeRefresh(){clearTimeout(vendorRealtimeRefreshTimer);vendorRealtimeRefreshTimer=setTimeout(()=>{loadOrders().catch(e=>console.warn('Vendor realtime refresh failed:',e))},180)}
async function setupVendorOrdersRealtime(){
  if(!vendorStore?.id)return;
  try{if(vendorOrdersRealtime){await sb.removeChannel(vendorOrdersRealtime);vendorOrdersRealtime=null}}catch(e){console.warn('Vendor realtime previous channel cleanup:',e)}
  const storeId=String(vendorStore.id);
  vendorOrdersRealtime=sb.channel('vendor-orders-'+storeId)
    .on('postgres_changes',{event:'*',schema:'public',table:'orders'},payload=>{
      try{
        const row=payload?.new||payload?.old||{},details=normalizeOrderDetails(row?.details),source=String(details?.source||''),rowStoreId=String(details?.store_id||'');
        if(rowStoreId&&rowStoreId!==storeId)return;
        if(source&&source!=='local_store')return;
        scheduleVendorRealtimeRefresh();
      }catch(e){console.warn('Vendor realtime event parse:',e);scheduleVendorRealtimeRefresh()}
    })
    .subscribe(status=>{if(['CHANNEL_ERROR','TIMED_OUT'].includes(status))console.warn('Vendor realtime status:',status)});
}
window.addEventListener('beforeunload',()=>{try{if(vendorOrdersRealtime)sb.removeChannel(vendorOrdersRealtime)}catch(e){console.warn('Vendor realtime unload cleanup:',e)}});
'''
if marker not in s:
    raise SystemExit('vendor Object.assign marker not found')
s = s.replace(marker, realtime + marker, 1)
p.write_text(s, encoding='utf-8')

# Employee workspace tabs — DOM layer only; existing IDs and Supabase logic stay intact.
p = Path('employee-dashboard.html')
s = p.read_text(encoding='utf-8')
anchor = '<p class="mini">كل التبويبات والعدادات والتحديثات تقرأ مباشرة من Supabase.</p>\n<div id="pipelineTabs" class="pipeline-tabs"></div>'
replacement = '''<p class="mini">كل التبويبات والعدادات والتحديثات تقرأ مباشرة من Supabase.</p>
<nav id="employeeWorkspaceTabs" class="employee-workspace-tabs" aria-label="مساحات عمل الموظف">
  <button type="button" class="employee-workspace-tab" data-workspace="new" onclick="switchEmployeeWorkspace('new')"><span>➕</span><b>إدخال شحنة جديدة</b><small>الوارد الجديد</small></button>
  <button type="button" class="employee-workspace-tab active" data-workspace="process" onclick="switchEmployeeWorkspace('process')"><span>⚙️</span><b>معالجة الشحنات</b><small>إدارة دورة الطلبات</small></button>
  <button type="button" class="employee-workspace-tab" data-workspace="labels" onclick="switchEmployeeWorkspace('labels')"><span>🖨️</span><b>طباعة الملصقات الحرارية</b><small>50mm × 40mm</small></button>
  <button type="button" class="employee-workspace-tab" data-workspace="track" onclick="switchEmployeeWorkspace('track')"><span>🔎</span><b>تتبع الطلبات</b><small>بحث / باركود</small></button>
</nav>
<div id="employeeWorkspaceHint" class="employee-workspace-hint">معالجة الشحنات — استخدم حالات الطلبات للتنقل بين مراحل الدورة.</div>
<div id="pipelineTabs" class="pipeline-tabs"></div>'''
if anchor not in s:
    raise SystemExit('employee workspace anchor not found')
s = s.replace(anchor, replacement, 1)

insert = r'''
<style id="employee-luxury-gold-v1">
:root{--emp-gold:#f5c451;--emp-gold-2:#d99b27;--emp-navy:#050b14;--emp-slate:#0f1b2d;--emp-card:rgba(15,27,45,.82);--emp-line:rgba(245,196,81,.20);--emp-muted:#cbd5e1;--emp-shadow:0 20px 60px rgba(0,0,0,.34)}
html{background:var(--emp-navy);color-scheme:dark}body{background:radial-gradient(circle at 10% 0%,rgba(245,196,81,.10),transparent 24%),radial-gradient(circle at 90% 4%,rgba(37,99,235,.16),transparent 30%),linear-gradient(145deg,#030712,#07111f 48%,#0b1424)!important;color:#f8fafc!important;min-height:100vh;padding:18px!important}.container{max-width:1580px!important;background:linear-gradient(145deg,rgba(9,18,32,.94),rgba(4,11,22,.90))!important;border:1px solid rgba(245,196,81,.18)!important;border-radius:26px!important;box-shadow:var(--emp-shadow),inset 0 1px 0 rgba(255,255,255,.04)!important;backdrop-filter:blur(20px);padding:22px!important}.top-nav{border-bottom:1px solid rgba(245,196,81,.18)!important;background:rgba(15,27,45,.48)!important;border-radius:20px!important;padding:16px 18px!important}.top-nav h2{color:#fff!important}.employee-badge,.customer-code{background:rgba(245,196,81,.10)!important;color:#fde68a!important;border:1px solid rgba(245,196,81,.22)!important}.mini{color:#aebdd0!important}.notification-bell{background:rgba(15,27,45,.84)!important;color:#fde68a!important;border:1px solid rgba(245,196,81,.22)!important}.notification-dropdown,.modal-content,.dashboard-scanner-panel{background:#0f1b2d!important;color:#f8fafc!important;border:1px solid rgba(245,196,81,.20)!important}.notification-head{background:#111f34!important;border-color:rgba(148,163,184,.14)!important}.notification-item{border-color:rgba(148,163,184,.10)!important}.notification-item:hover{background:rgba(245,196,81,.06)!important}
.employee-workspace-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:18px 0 10px}.employee-workspace-tab{display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto auto;column-gap:10px;align-items:center;text-align:right;border:1px solid rgba(148,163,184,.14);background:linear-gradient(145deg,rgba(15,27,45,.88),rgba(7,17,31,.78));color:#e2e8f0;border-radius:18px;padding:13px 14px;cursor:pointer;transition:.22s ease;box-shadow:0 10px 28px rgba(0,0,0,.18)}.employee-workspace-tab>span{grid-row:1/3;font-size:22px}.employee-workspace-tab b{font-size:13px}.employee-workspace-tab small{font-size:10px;color:#94a3b8;margin-top:2px}.employee-workspace-tab:hover{transform:translateY(-2px);border-color:rgba(245,196,81,.38)}.employee-workspace-tab.active{background:linear-gradient(135deg,#fde68a,#f5c451 58%,#d99b27);color:#111827;border-color:#f5c451;box-shadow:0 12px 30px rgba(217,155,39,.24),0 0 22px rgba(245,196,81,.10)}.employee-workspace-tab.active small{color:#5b4211}.employee-workspace-hint{margin-bottom:12px;padding:10px 13px;border-radius:13px;border:1px solid rgba(245,196,81,.16);background:rgba(245,196,81,.06);color:#fde68a;font-size:12px;font-weight:800}
#pipelineTabs{background:rgba(7,17,31,.76)!important;border:1px solid rgba(148,163,184,.12)!important;box-shadow:0 16px 44px rgba(0,0,0,.24)!important;backdrop-filter:blur(16px)}#pipelineTabs .pipeline-tab{background:rgba(15,27,45,.76)!important;color:#cbd5e1!important;border:1px solid rgba(148,163,184,.12)!important;box-shadow:none!important}#pipelineTabs .pipeline-tab:hover{border-color:rgba(245,196,81,.30)!important;color:#fff!important}#pipelineTabs .pipeline-tab.active{background:linear-gradient(135deg,#fde68a,#f5c451 58%,#d99b27)!important;color:#111827!important;border-color:#f5c451!important;box-shadow:0 8px 20px rgba(217,155,39,.20)!important}#pipelineTabs .pipeline-tab.active .pipeline-count{background:#111827!important;color:#fde68a!important}.status-sidebar-title{color:#fde68a!important;font-weight:900}.status-group-separator{background:linear-gradient(90deg,transparent,rgba(245,196,81,.55),transparent)!important}
.toolbar,.branch-tools{background:rgba(15,27,45,.82)!important;border:1px solid rgba(245,196,81,.16)!important;border-radius:18px!important;box-shadow:0 12px 34px rgba(0,0,0,.22)!important}.toolbar input,.toolbar select,.branch-tools select,table select,table input{background:rgba(2,8,23,.74)!important;color:#f8fafc!important;border:1px solid rgba(148,163,184,.18)!important;border-radius:11px!important;outline:none}.toolbar input:focus,table select:focus,table input:focus{border-color:rgba(245,196,81,.55)!important;box-shadow:0 0 0 3px rgba(245,196,81,.08)!important}.btn{border-radius:11px!important;transition:.2s ease}.btn:hover{transform:translateY(-1px);filter:brightness(1.06)}.btn-green{background:linear-gradient(135deg,#16a34a,#15803d)!important}.btn-blue{background:linear-gradient(135deg,#2563eb,#1d4ed8)!important}.btn-purple{background:linear-gradient(135deg,#7c3aed,#6d28d9)!important}.btn-orange{background:linear-gradient(135deg,#d99b27,#b7791f)!important}.btn-dark{background:#334155!important}button[onclick*="print"],button[onclick*="Print"],.btn-purple[onclick*="label"]{border:1px solid rgba(245,196,81,.58)!important;box-shadow:0 0 0 1px rgba(245,196,81,.08),0 8px 22px rgba(217,155,39,.16)!important}
.table-wrap{overflow-x:hidden!important;background:rgba(7,17,31,.64)!important;border:1px solid rgba(148,163,184,.12)!important;border-radius:18px!important}table{width:100%!important;min-width:0!important;table-layout:fixed!important;background:transparent!important}th,td{border-color:rgba(148,163,184,.11)!important;color:#e5edf7!important;padding:9px 7px!important;overflow-wrap:anywhere;word-break:break-word;white-space:normal!important}th{background:#111f34!important;color:#fde68a!important;font-size:11px!important}tr.row-new{background:rgba(245,196,81,.08)!important}tr.row-approved{background:rgba(22,163,74,.08)!important}tr.row-rejected{background:rgba(220,38,38,.08)!important}.collect-due{background:rgba(245,196,81,.09)!important;color:#fde68a!important}.qty-badge{background:rgba(245,196,81,.10)!important;color:#fde68a!important;border-color:rgba(245,196,81,.28)!important}.pagination-bar button{background:#1d4ed8!important}.pagination-bar .current{background:#d99b27!important;color:#111827!important}.detail-box,.chat-box{background:rgba(2,8,23,.58)!important;border-color:rgba(148,163,184,.14)!important;color:#f8fafc!important}
@media(max-width:1100px){.employee-workspace-tabs{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:980px){body{padding:8px!important}.container{padding:12px!important}.employee-workspace-tabs{grid-template-columns:repeat(2,minmax(0,1fr))}table{font-size:11px!important}th,td{padding:7px 4px!important}}
@media(max-width:620px){.employee-workspace-tabs{grid-template-columns:1fr}.employee-workspace-tab{padding:11px 12px}.top-nav{align-items:flex-start!important}.table-wrap{overflow-x:hidden!important}table{table-layout:auto!important;font-size:10px!important}th,td{font-size:9px!important;padding:6px 3px!important}}
</style>
<script id="employee-workspace-tabs-v1">
(function(){
  const map={new:'waiting_employee',process:'all',labels:'shipping_prep',track:'all'};
  const hints={new:'إدخال شحنة جديدة — يعرض الطلبات الواردة بانتظار رد الموظف.',process:'معالجة الشحنات — استخدم حالات الطلبات للتنقل بين جميع مراحل الدورة.',labels:'طباعة الملصقات الحرارية — تم إبراز إجراءات الطباعة بمقاس 50mm × 40mm.',track:'تتبع الطلبات — استخدم البحث أو الباركود للوصول إلى الشحنة مباشرة.'};
  window.switchEmployeeWorkspace=async function(mode){
    const key=map[mode]||'all';
    document.querySelectorAll('.employee-workspace-tab').forEach(btn=>btn.classList.toggle('active',btn.dataset.workspace===mode));
    const hint=document.getElementById('employeeWorkspaceHint');if(hint)hint.textContent=hints[mode]||hints.process;
    if(typeof window.switchPipeline==='function')await window.switchPipeline(key);
    if(mode==='track'){const input=document.getElementById('employeeOrderSearch');if(input){input.focus();input.scrollIntoView({behavior:'smooth',block:'center'})}}
  };
})();
</script>
'''
# employee-dashboard.html currently has valid but noncanonical content after </html>; append after everything.
s += insert
p.write_text(s, encoding='utf-8')
