from pathlib import Path
import re

p=Path('vendor-dashboard.html')
s=p.read_text(encoding='utf-8')

css='''\n    .vendor-main-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.65rem;margin-bottom:1rem}\n    .vendor-main-tab{border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#cbd5e1;border-radius:1rem;padding:.9rem 1rem;font-weight:900;transition:.2s ease;cursor:pointer}\n    .vendor-main-tab:hover{transform:translateY(-1px);border-color:rgba(56,189,248,.35);background:rgba(56,189,248,.08)}\n    .vendor-main-tab.active{color:#fff;border-color:rgba(56,189,248,.55);background:linear-gradient(135deg,rgba(14,165,233,.28),rgba(79,70,229,.24));box-shadow:0 10px 30px rgba(14,165,233,.12)}\n    .vendor-tab-panel{display:none}.vendor-tab-panel.active{display:block}\n    .vendor-order-filters{display:flex;flex-wrap:wrap;gap:.5rem;margin:.85rem 0 1rem}\n    .vendor-order-filter{border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#cbd5e1;border-radius:999px;padding:.55rem .85rem;font-size:.78rem;font-weight:800;cursor:pointer;transition:.2s ease}\n    .vendor-order-filter:hover{border-color:rgba(56,189,248,.35)}\n    .vendor-order-filter.active{color:#fff;background:#2563eb;border-color:#3b82f6;box-shadow:0 6px 18px rgba(37,99,235,.22)}\n    .vendor-responsive-table,.vendor-compact-table{width:100%;table-layout:fixed;border-collapse:collapse}\n    .vendor-responsive-table th,.vendor-responsive-table td,.vendor-compact-table th,.vendor-compact-table td{padding:.75rem .55rem;vertical-align:middle;overflow-wrap:anywhere;word-break:break-word}\n    .vendor-responsive-table th,.vendor-compact-table th{font-size:.72rem}\n    .vendor-responsive-table td,.vendor-compact-table td{font-size:.8rem}\n    .vendor-table-wrap{width:100%;overflow:hidden}\n    .light .vendor-main-tab,.light .vendor-order-filter{border-color:#cbd5e1;background:#fff;color:#475569}.light .vendor-main-tab.active,.light .vendor-order-filter.active{color:#fff}\n    @media(max-width:900px){.vendor-main-tabs{grid-template-columns:1fr}.vendor-responsive-table thead{display:none}.vendor-responsive-table,.vendor-responsive-table tbody,.vendor-responsive-table tr{display:block;width:100%}.vendor-responsive-table tr{margin-bottom:.8rem;border:1px solid rgba(255,255,255,.09);border-radius:1rem;background:rgba(255,255,255,.03);overflow:hidden}.vendor-responsive-table td{display:grid;grid-template-columns:105px minmax(0,1fr);gap:.65rem;align-items:center;width:100%;text-align:right;border-bottom:1px solid rgba(255,255,255,.06);padding:.7rem}.vendor-responsive-table td::before{content:attr(data-label);font-size:.72rem;font-weight:900;color:#94a3b8}.vendor-responsive-table td:last-child{border-bottom:0}.vendor-compact-table th,.vendor-compact-table td{padding:.55rem .3rem;font-size:.7rem}.vendor-compact-table th{font-size:.66rem}}\n'''
style_end=s.index('  </style>')
s=s[:style_end]+css+s[style_end:]

start_marker='    <section class="mb-6 grid gap-4 xl:grid-cols-[1.3fr_.7fr]">'
start=s.index(start_marker)
end=s.index('  </main>',start)
new_markup='''    <nav class="vendor-main-tabs" aria-label="أقسام لوحة التاجر">
      <button id="vendorTabBtn-orders" type="button" class="vendor-main-tab active" onclick="setVendorTab('orders')">📦 إدارة الطلبات</button>
      <button id="vendorTabBtn-finance" type="button" class="vendor-main-tab" onclick="setVendorTab('finance')">💰 الحساب المالي</button>
      <button id="vendorTabBtn-products" type="button" class="vendor-main-tab" onclick="setVendorTab('products')">🛍️ المنتجات والمخزون</button>
    </nav>

    <section id="vendorTab-orders" class="vendor-tab-panel active">
      <div class="glass rounded-3xl p-4 md:p-5">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 class="vendor-text text-lg font-black">إدارة الطلبات</h2><p class="vendor-muted mt-1 text-xs text-slate-400">عرض كامل للطلبات مع فلاتر سريعة حسب الحالة، بدون تمرير أفقي.</p></div><button onclick="loadOrders()" class="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-black">تحديث الطلبات</button></div>
        <div class="vendor-order-filters" aria-label="فلترة الطلبات">
          <button type="button" class="vendor-order-filter active" data-order-filter="all" onclick="setVendorOrderFilter('all')">الكل</button>
          <button type="button" class="vendor-order-filter" data-order-filter="pending" onclick="setVendorOrderFilter('pending')">بانتظار الموافقة</button>
          <button type="button" class="vendor-order-filter" data-order-filter="delivery" onclick="setVendorOrderFilter('delivery')">قيد التوصيل</button>
          <button type="button" class="vendor-order-filter" data-order-filter="delivered" onclick="setVendorOrderFilter('delivered')">تم التسليم</button>
          <button type="button" class="vendor-order-filter" data-order-filter="returns" onclick="setVendorOrderFilter('returns')">المرتجعات</button>
        </div>
        <p class="vendor-muted mb-3 text-xs text-slate-400">تظهر هنا طلبات هذا المتجر فقط من دورة الطلبات الرئيسية، مع إخفاء هاتف العميل وعنوانه التفصيلي حفاظًا على الخصوصية.</p>
        <div class="vendor-table-wrap"><table class="vendor-responsive-table text-sm"><thead class="border-b border-white/10 text-slate-400"><tr><th>رقم الطلب</th><th>المنتج</th><th>الكمية</th><th>عدد الطرود</th><th>المحافظة / المدينة</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody id="ordersBody"></tbody></table></div>
      </div>
    </section>

    <section id="vendorTab-finance" class="vendor-tab-panel">
      <div class="glass rounded-3xl p-4 md:p-6">
        <div class="mb-5"><h2 class="vendor-text text-xl font-black">الحساب المالي</h2><p class="vendor-muted mt-1 text-xs text-slate-400">المكاشفات المالية الخاصة بالمتجر في شاشة مستقلة وواضحة.</p></div>
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div class="rounded-2xl border border-white/10 bg-white/5 p-4"><span class="vendor-muted text-xs text-slate-400">المبيعات</span><div id="finSales" class="mt-2 text-xl font-black text-emerald-300">0</div></div>
          <div class="rounded-2xl border border-white/10 bg-white/5 p-4"><span class="vendor-muted text-xs text-slate-400">عمولة MeshWar</span><div id="finCommission" class="mt-2 text-xl font-black text-sky-300">0</div></div>
          <div class="rounded-2xl border border-white/10 bg-white/5 p-4"><span class="vendor-muted text-xs text-slate-400">النقل + المصروفات</span><div id="finCosts" class="mt-2 text-xl font-black text-amber-300">0</div></div>
          <div class="rounded-2xl border border-white/10 bg-white/5 p-4"><span class="vendor-muted text-xs text-slate-400">غرامات المرتجعات</span><div id="finPenalties" class="mt-2 text-xl font-black text-rose-300">0</div></div>
        </div>
        <div class="mt-4 rounded-2xl border border-violet-400/20 bg-violet-500/10 p-5"><div class="text-xs text-violet-200">الصافي = المبيعات - العمولة - النقل - المصروفات - الغرامات</div><div id="finNet" class="mt-2 text-3xl font-black text-violet-200">0</div></div>
      </div>
    </section>

    <section id="vendorTab-products" class="vendor-tab-panel">
      <div class="grid gap-4 xl:grid-cols-[1.45fr_.55fr]">
        <div class="glass rounded-3xl p-4 md:p-5">
          <div class="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h2 class="vendor-text text-lg font-black">إدارة المنتجات والمخزون</h2><p class="vendor-muted text-xs text-slate-400">الوصف المختصر بحد أقصى 30 حرفًا.</p></div><button type="button" onclick="openProductModal()" class="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-black transition hover:bg-emerald-400">+ منتج جديد</button></div>
          <div id="lowStockBanner" class="mb-3 hidden rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm font-bold text-amber-200"></div>
          <div class="vendor-table-wrap"><table class="vendor-compact-table text-sm"><thead class="border-b border-white/10 text-slate-400"><tr><th>المنتج</th><th>السعر</th><th>المخزون</th><th>الخيارات</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody id="productsBody"></tbody></table></div>
        </div>
        <div class="glass rounded-3xl p-4 md:p-5">
          <h2 class="vendor-text text-lg font-black">سعر الصرف المركزي</h2>
          <p class="vendor-muted mt-1 text-xs leading-6 text-slate-400">يُحفظ السعر على مستوى المتجر وتُعرض جميع أسعار المنتجات بالقيمة المحولة فورًا دون إتلاف السعر الأصلي.</p>
          <div class="mt-4 grid grid-cols-2 gap-3">
            <select id="exchangeBase" class="field"><option>USD</option><option>IQD</option><option>TRY</option><option>SYP</option><option>EUR</option><option>SAR</option><option>AED</option><option>JOD</option></select>
            <select id="exchangeTarget" class="field"><option>IQD</option><option>USD</option><option>TRY</option><option>SYP</option><option>EUR</option><option>SAR</option><option>AED</option><option>JOD</option></select>
            <input id="exchangeRate" class="field col-span-2" type="number" min="0.000001" step="0.000001" placeholder="مثال: 1500">
            <button type="button" onclick="saveExchangeRate()" class="col-span-2 rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-600 px-5 py-3 font-black transition hover:scale-[1.01]">تطبيق سعر الصرف على العرض</button>
          </div>
          <div id="exchangePreview" class="vendor-muted mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">—</div>
        </div>
      </div>
    </section>
'''
s=s[:start]+new_markup+s[end:]

insert_before='async function loadOrders()'
idx=s.index(insert_before)
js='''let activeVendorTab='orders',activeVendorOrderFilter='all';
function setVendorTab(tab){const allowed=['orders','finance','products'];if(!allowed.includes(tab))tab='orders';activeVendorTab=tab;allowed.forEach(name=>{document.getElementById('vendorTab-'+name)?.classList.toggle('active',name===tab);document.getElementById('vendorTabBtn-'+name)?.classList.toggle('active',name===tab)});if(tab==='orders')renderVendorOrders();if(tab==='finance')renderFinance()}
function setVendorOrderFilter(filter){activeVendorOrderFilter=filter||'all';document.querySelectorAll('[data-order-filter]').forEach(btn=>btn.classList.toggle('active',btn.dataset.orderFilter===activeVendorOrderFilter));renderVendorOrders()}
function vendorOrderMatchesFilter(o){const status=String(o?.status||'').trim();if(activeVendorOrderFilter==='all')return true;if(activeVendorOrderFilter==='delivered')return isDeliveredOrder(status);if(activeVendorOrderFilter==='returns')return /مرتجع|ارجاع|إرجاع|مرفوض|رفض|ملغي|ملغى|return/i.test(status);if(activeVendorOrderFilter==='delivery')return /مندوب|قيد التوصيل|تم الشحن|شحن|توزيع|فرع|delivery|courier/i.test(status)&&!isDeliveredOrder(status);if(activeVendorOrderFilter==='pending')return /انتظار|بانتظار|موافقة|تدقيق|جديد|pending|approval/i.test(status);return true}
function renderVendorOrders(){const body=$('ordersBody');if(!body)return;const visible=orders.filter(vendorOrderMatchesFilter);body.innerHTML=visible.map(o=>`<tr class="border-b border-white/5"><td data-label="رقم الطلب"><div class="font-bold">${esc(o.order_code||String(o.id).slice(0,8))}</div><div class="vendor-muted text-xs text-slate-500">${new Date(o.created_at).toLocaleString('ar')}</div></td><td data-label="المنتج">${esc(orderProductName(o))}</td><td data-label="الكمية">${orderQuantity(o)}</td><td data-label="عدد الطرود"><span class="rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-1 text-xs font-black text-amber-200">${orderParcelsCount(o)}</span></td><td data-label="المحافظة / المدينة">${esc(orderCity(o))}</td><td data-label="الحالة"><span class="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs">${esc(o.status||'انتظار رد الموظف')}</span></td><td data-label="الإجراء"><div class="flex flex-wrap gap-2"><button type="button" onclick="printShippingLabel('${esc(o.id)}')" class="rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-xs font-black text-sky-200 transition hover:bg-sky-500/20">🖨️ طباعة الملصق</button><button type="button" onclick="openVendorOrderDetails('${esc(o.id)}')" class="rounded-lg border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-xs font-black text-violet-200 transition hover:bg-violet-500/20">تفاصيل</button></div></td></tr>`).join('')||'<tr><td colspan="7" class="p-6 text-center text-slate-400">لا توجد طلبات ضمن هذا التصنيف.</td></tr>'}
'''
s=s[:idx]+js+s[idx:]

fn_start=s.index('async function loadOrders()')
fn_end=s.index('function openVendorOrderDetails',fn_start)
chunk=s[fn_start:fn_end]
render_start=chunk.index("$('ordersBody').innerHTML=")
render_end=chunk.index(';renderFinance();renderStats()',render_start)
chunk=chunk[:render_start]+'renderVendorOrders()'+chunk[render_end:]
s=s[:fn_start]+chunk+s[fn_end:]

old='Object.assign(window,{vendorLogin,vendorLogout,toggleTheme,openProductModal,closeProductModal,editProduct,saveProduct,deleteProduct,saveExchangeRate,loadOrders,printShippingLabel,openVendorOrderDetails,closeVendorOrderDetails});'
new='Object.assign(window,{vendorLogin,vendorLogout,toggleTheme,openProductModal,closeProductModal,editProduct,saveProduct,deleteProduct,saveExchangeRate,loadOrders,printShippingLabel,openVendorOrderDetails,closeVendorOrderDetails,setVendorTab,setVendorOrderFilter});'
if old not in s: raise SystemExit('Object.assign anchor not found')
s=s.replace(old,new,1)

p.write_text(s,encoding='utf-8')
print('vendor tabs layout patch applied')
