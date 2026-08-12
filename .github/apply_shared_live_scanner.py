from pathlib import Path

FILES={
'admin-dashboard.html':{
 'input_old':'<input id="orderSearchInput" type="text" placeholder="MW / Sipariş No / العميل / الهاتف / البريد / الكود" oninput="scheduleOrderSearch()" onkeydown="handleOrderSearchKeydown(event)" style="width:390px">',
 'input_new':'<input id="orderSearchInput" type="text" placeholder="MW / Sipariş No / العميل / الهاتف / البريد / الكود" oninput="adminBarcodeSearchInput(event)" onkeyup="adminBarcodeSearchKeyup(event)" onkeydown="handleOrderSearchKeydown(event)" autocomplete="off" style="width:390px"><button class="btn-blue" type="button" onclick="startDashboardCameraScanner()">📷 مسح بالكاميرا</button>',
 'search_id':'orderSearchInput','load':'loadAdminOrders','page':'orderPage','timer':'orderSearchTimer',
 'query_old':"let q=sb.from('orders').select('*',{count:'exact'});if(p.branch){q=q.in('status',p.statuses).or('branch_id.not.is.null,branch_name.not.is.null');const bid=document.getElementById('adminBranchFilter').value;if(bid)q=q.eq('branch_id',bid)}else q=q.in('status',p.statuses);if(term){",
 'query_new':"let q=sb.from('orders').select('*',{count:'exact'});if(!term){if(p.branch){q=q.in('status',p.statuses).or('branch_id.not.is.null,branch_name.not.is.null');const bid=document.getElementById('adminBranchFilter').value;if(bid)q=q.eq('branch_id',bid)}else q=q.in('status',p.statuses)}if(term){",
 'funcs':'admin'
},
'employee-dashboard.html':{
 'input_old':'<input id="employeeOrderSearch" type="text" placeholder="MW / Sipariş No / العميل / الهاتف" oninput="schedulePipelineSearch()" onkeydown="handlePipelineSearchKeydown(event)" autocomplete="off">',
 'input_new':'<input id="employeeOrderSearch" type="text" placeholder="MW / Sipariş No / العميل / الهاتف" oninput="employeeBarcodeSearchInput(event)" onkeyup="employeeBarcodeSearchKeyup(event)" onkeydown="handlePipelineSearchKeydown(event)" autocomplete="off"><button class="btn btn-blue" type="button" onclick="startDashboardCameraScanner()">📷 مسح بالكاميرا</button>',
 'search_id':'employeeOrderSearch','load':'loadPipelineOrders','page':'pipelinePage','timer':'pipelineSearchTimer',
 'query_old':"function buildPipelineQuery(sb,count=false){const p=PIPELINES[activePipeline],term=normalizeSearch(document.getElementById('employeeOrderSearch')?.value||'');let q=sb.from('orders').select('*',count?{count:'exact'}:{});if(p.branch){q=q.in('status',p.statuses).or('branch_id.not.is.null,branch_name.not.is.null');const branch=cloudId(document.getElementById('branchFilter')?.value);if(branch)q=q.eq('branch_id',branch)}else q=q.in('status',p.statuses);if(term){",
 'query_new':"function buildPipelineQuery(sb,count=false){const p=PIPELINES[activePipeline],term=normalizeSearch(document.getElementById('employeeOrderSearch')?.value||'');let q=sb.from('orders').select('*',count?{count:'exact'}:{});if(!term){if(p.branch){q=q.in('status',p.statuses).or('branch_id.not.is.null,branch_name.not.is.null');const branch=cloudId(document.getElementById('branchFilter')?.value);if(branch)q=q.eq('branch_id',branch)}else q=q.in('status',p.statuses)}if(term){",
 'funcs':'employee'
},
'branch-dashboard.html':{
 'input_old':'<input id="orderSearch" placeholder="MW / Sipariş / الباركود / العميل / الهاتف / المندوب" oninput="scheduleSearch()" onkeydown="handleSearchKeydown(event)" autocomplete="off">',
 'input_new':'<input id="orderSearch" placeholder="MW / Sipariş / الباركود / العميل / الهاتف / المندوب" oninput="branchBarcodeSearchInput(event)" onkeyup="branchBarcodeSearchKeyup(event)" onkeydown="handleSearchKeydown(event)" autocomplete="off"><button class="blue" type="button" onclick="startDashboardCameraScanner()">📷 مسح بالكاميرا</button>',
 'search_id':'orderSearch','load':'loadOrders','page':'page','timer':'searchTimer',
 'query_old':"if(statusFilter.value)q=q.eq('status',statusFilter.value);if(dateFrom.value)",
 'query_new':"if(!raw&&statusFilter.value)q=q.eq('status',statusFilter.value);if(dateFrom.value)",
 'funcs':'branch'
}}

css='''.dashboard-scanner-wrap{display:none;position:fixed;inset:0;z-index:12000;background:rgba(15,23,42,.88);padding:14px;overflow:auto}.dashboard-scanner-wrap.show{display:flex;align-items:center;justify-content:center}.dashboard-scanner-panel{width:min(96vw,620px);background:#fff;border-radius:16px;padding:12px;box-shadow:0 20px 60px #0006;color:#172033}.dashboard-scanner-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}#dashboardScannerReader{width:100%;max-width:560px;margin:auto}.dashboard-camera-hint{margin-top:8px;text-align:center;font-size:12px;color:#64748b}'''

modal='''<div id="dashboardScannerModal" class="dashboard-scanner-wrap"><div class="dashboard-scanner-panel"><div class="dashboard-scanner-head"><b>مسح باركود مباشر بالكاميرا الخلفية</b><button type="button" style="background:#dc2626;color:#fff" onclick="stopDashboardCameraScanner()">إلغاء المسح</button></div><div id="dashboardScannerReader"></div><div id="dashboardCameraHint" class="dashboard-camera-hint">وجّه الكاميرا نحو الباركود وسيتم التقاطه تلقائياً.</div></div></div>'''

base_helpers='''
function dashboardArabicDigitsToLatin(s){const map={'٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9','۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9'};return String(s||'').replace(/[٠-٩۰-۹]/g,d=>map[d]||d)}
function cleanBarcodeScannerInput(value){let cleaned=dashboardArabicDigitsToLatin(value).normalize('NFKD').replace(/[\\u0610-\\u061A\\u064B-\\u065F\\u0670\\u06D6-\\u06ED\\u200B-\\u200F\\u202A-\\u202E\\u2060\\uFEFF]/g,'').replace(/[\\r\\n\\t\\s]+/g,'').toUpperCase().replace(/[^A-Z0-9-]/g,'').replace(/-{2,}/g,'-');cleaned=cleaned.replace(/^-+/, '-').replace(/-+$/, '');if(/^-[0-9]+$/.test(cleaned))cleaned='MW'+cleaned;else if(/^MW[0-9]+$/.test(cleaned))cleaned='MW-'+cleaned.slice(2);return cleaned}
let dashboardCameraScanner=null;
async function startDashboardCameraScanner(){const modal=document.getElementById('dashboardScannerModal'),hint=document.getElementById('dashboardCameraHint');modal.classList.add('show');if(hint)hint.textContent='جاري تشغيل الكاميرا الخلفية...';if(dashboardCameraScanner){try{await dashboardCameraScanner.stop()}catch{}try{await dashboardCameraScanner.clear()}catch{}dashboardCameraScanner=null}dashboardCameraScanner=new Html5Qrcode('dashboardScannerReader');const onSuccess=async decodedText=>{const clean=cleanBarcodeScannerInput(decodedText);if(!clean)return;try{await dashboardCameraScanner.stop()}catch{}try{await dashboardCameraScanner.clear()}catch{}dashboardCameraScanner=null;modal.classList.remove('show');const input=document.getElementById(DASHBOARD_BARCODE_SEARCH_ID);if(input){input.value=clean;input.dispatchEvent(new Event('input',{bubbles:true}))}};try{await dashboardCameraScanner.start({facingMode:'environment'},{fps:10,qrbox:{width:250,height:150}},onSuccess,()=>{});if(hint)hint.textContent='وجّه الكاميرا نحو الباركود وسيتم التقاطه تلقائياً.'}catch(err){console.error('Camera permission error:',err);try{await dashboardCameraScanner.clear()}catch{}dashboardCameraScanner=null;const reader=document.getElementById('dashboardScannerReader');if(reader)reader.innerHTML='<div style="padding:20px;text-align:center;color:#e74c3c"><p><b>تم حظر الوصول للكاميرا من إعدادات المتصفح.</b></p><p style="font-size:12px;color:#555">يرجى الضغط على رمز القفل 🔒 بجانب رابط الموقع في أعلى المتصفح والسماح بـ "الكاميرا"، ثم تحديث الصفحة.</p></div>';if(hint)hint.textContent=''}}
async function stopDashboardCameraScanner(){if(dashboardCameraScanner){try{await dashboardCameraScanner.stop()}catch{}try{await dashboardCameraScanner.clear()}catch{}dashboardCameraScanner=null}document.getElementById('dashboardScannerModal')?.classList.remove('show')}
'''

for fn,cfg in FILES.items():
    p=Path(fn); s=p.read_text(encoding='utf-8')
    if 'html5-qrcode@2.3.8' not in s:
        s=s.replace('</head>','<script src="https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"></script></head>',1)
    if '.dashboard-scanner-wrap{' not in s:
        s=s.replace('</style>',css+'\n</style>',1)
    if cfg['input_old'] not in s: raise SystemExit(f'{fn}: search input target not found')
    s=s.replace(cfg['input_old'],cfg['input_new'],1)
    if cfg['query_old'] not in s: raise SystemExit(f'{fn}: query target not found')
    s=s.replace(cfg['query_old'],cfg['query_new'],1)
    if 'id="dashboardScannerModal"' not in s:
        s=s.replace('</body>',modal+'\n</body>',1)
    prefix=f"const DASHBOARD_BARCODE_SEARCH_ID='{cfg['search_id']}';\n"+base_helpers
    kind=cfg['funcs']
    if kind=='admin':
        wrappers="""function adminBarcodeSearchInput(e){const el=e?.target||document.getElementById('orderSearchInput'),clean=cleanBarcodeScannerInput(el?.value||'');if(el&&el.value!==clean)el.value=clean;orderPage=1;clearTimeout(orderSearchTimer);orderSearchTimer=setTimeout(loadAdminOrders,160)}function adminBarcodeSearchKeyup(e){if(e?.key==='Enter')return;adminBarcodeSearchInput(e)}\n"""
    elif kind=='employee':
        wrappers="""function employeeBarcodeSearchInput(e){const el=e?.target||document.getElementById('employeeOrderSearch'),clean=cleanBarcodeScannerInput(el?.value||'');if(el&&el.value!==clean)el.value=clean;pipelinePage=1;clearTimeout(pipelineSearchTimer);pipelineSearchTimer=setTimeout(loadPipelineOrders,180)}function employeeBarcodeSearchKeyup(e){if(e?.key==='Enter')return;employeeBarcodeSearchInput(e)}\n"""
    else:
        wrappers="""function branchBarcodeSearchInput(e){const el=e?.target||document.getElementById('orderSearch'),clean=cleanBarcodeScannerInput(el?.value||'');if(el&&el.value!==clean)el.value=clean;page=1;barcodeScanPending=false;clearTimeout(searchTimer);searchTimer=setTimeout(()=>loadOrders(clean),300)}function branchBarcodeSearchKeyup(e){if(e?.key==='Enter')return;branchBarcodeSearchInput(e)}\n"""
    marker='<script>\n'
    if 'DASHBOARD_BARCODE_SEARCH_ID' not in s:
        if marker not in s: raise SystemExit(f'{fn}: script marker not found')
        s=s.replace(marker,marker+prefix+wrappers,1)
    p.write_text(s,encoding='utf-8')
    print('patched',fn)
