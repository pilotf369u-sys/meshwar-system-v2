from pathlib import Path

p=Path('vendor-dashboard.html')
s=p.read_text(encoding='utf-8')

def once(old,new,label):
    global s
    if old not in s:
        raise SystemExit('missing target: '+label)
    s=s.replace(old,new,1)

once('<th class="p-3">رقم الطلب</th><th>المنتج</th><th>الكمية</th><th>المحافظة / المدينة</th><th>الحالة</th><th>الإجراء</th>',
     '<th class="p-3">رقم الطلب</th><th>المنتج</th><th>الكمية</th><th>عدد الطرود</th><th>المحافظة / المدينة</th><th>الحالة</th><th>الإجراء</th>',
     'orders header')

once("function orderQuantity(o){const d=normalizeOrderDetails(o?.details);return Math.max(1,Number(d.quantity||1)||1)}",
     "function orderQuantity(o){const d=normalizeOrderDetails(o?.details);return Math.max(1,Number(d.quantity||1)||1)}\nfunction orderParcelsCount(o){const d=normalizeOrderDetails(o?.details),n=Number(d.parcels_count??1);return Number.isFinite(n)&&n>=1?Math.max(1,Math.floor(n)):1}",
     'parcels helper')

old_row="""<td>${esc(orderProductName(o))}</td><td>${orderQuantity(o)}</td><td>${esc(orderCity(o))}</td><td><span class=\"rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs\">${esc(o.status||'انتظار رد الموظف')}</span></td><td><button type=\"button\" onclick=\"printShippingLabel('${esc(o.id)}')\" class=\"rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-xs font-black text-sky-200 transition hover:bg-sky-500/20\">🖨️ طباعة الملصق</button></td>"""
new_row="""<td>${esc(orderProductName(o))}</td><td>${orderQuantity(o)}</td><td><span class=\"rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-1 text-xs font-black text-amber-200\">${orderParcelsCount(o)}</span></td><td>${esc(orderCity(o))}</td><td><span class=\"rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs\">${esc(o.status||'انتظار رد الموظف')}</span></td><td><div class=\"flex flex-wrap gap-2\"><button type=\"button\" onclick=\"printShippingLabel('${esc(o.id)}')\" class=\"rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-xs font-black text-sky-200 transition hover:bg-sky-500/20\">🖨️ طباعة الملصق</button><button type=\"button\" onclick=\"openVendorOrderDetails('${esc(o.id)}')\" class=\"rounded-lg border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-xs font-black text-violet-200 transition hover:bg-violet-500/20\">تفاصيل</button></div></td>"""
once(old_row,new_row,'orders row')
once("colspan=\"6\" class=\"p-6 text-center text-slate-400\"","colspan=\"7\" class=\"p-6 text-center text-slate-400\"",'empty colspan')

marker="async function loadFinance(){renderFinance();renderStats()}"
details_fn=r'''function openVendorOrderDetails(orderId){const o=orders.find(x=>String(x.id)===String(orderId));if(!o)return showNotice('تعذر العثور على الطلب.',true);let modal=document.getElementById('vendorOrderDetailsModal');if(!modal){modal=document.createElement('div');modal.id='vendorOrderDetailsModal';modal.className='fixed inset-0 z-[80] hidden items-center justify-center bg-black/80 p-4 backdrop-blur-sm';modal.innerHTML='<div class="glass w-full max-w-lg rounded-3xl p-5"><div class="mb-4 flex items-center justify-between"><h3 class="vendor-text text-lg font-black">تفاصيل الطلب</h3><button type="button" class="rounded-lg bg-rose-500 px-3 py-1 font-black" onclick="closeVendorOrderDetails()">×</button></div><div id="vendorOrderDetailsBody" class="grid gap-3 sm:grid-cols-2"></div></div>';document.body.appendChild(modal)}const body=document.getElementById('vendorOrderDetailsBody');body.innerHTML=`<div class="rounded-2xl border border-white/10 bg-white/5 p-3"><div class="vendor-muted text-xs text-slate-400">رقم الطلب</div><div class="mt-1 font-black">${esc(o.order_code||o.id)}</div></div><div class="rounded-2xl border border-white/10 bg-white/5 p-3"><div class="vendor-muted text-xs text-slate-400">الحالة</div><div class="mt-1 font-black">${esc(o.status||'')}</div></div><div class="rounded-2xl border border-white/10 bg-white/5 p-3"><div class="vendor-muted text-xs text-slate-400">المنتج</div><div class="mt-1 font-black">${esc(orderProductName(o))}</div></div><div class="rounded-2xl border border-white/10 bg-white/5 p-3"><div class="vendor-muted text-xs text-slate-400">المحافظة / المدينة</div><div class="mt-1 font-black">${esc(orderCity(o))}</div></div><div class="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-3"><div class="vendor-muted text-xs text-slate-400">عدد القطع</div><div class="mt-1 text-xl font-black text-sky-200">${orderQuantity(o)}</div></div><div class="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3"><div class="vendor-muted text-xs text-slate-400">عدد الطرود</div><div class="mt-1 text-xl font-black text-amber-200">${orderParcelsCount(o)}</div></div>`;modal.classList.remove('hidden');modal.classList.add('flex')}
function closeVendorOrderDetails(){const modal=document.getElementById('vendorOrderDetailsModal');if(!modal)return;modal.classList.add('hidden');modal.classList.remove('flex')}
'''
once(marker,details_fn+marker,'details function insertion')

old_print="const code=o.order_code||String(o.id).slice(0,8),product=orderProductName(o),qty=orderQuantity(o),city=orderCity(o),payment=orderPaymentStatus(o),date=new Date(o.created_at).toLocaleDateString('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}).replaceAll('-','/');"
new_print="const code=o.order_code||String(o.id).slice(0,8),product=orderProductName(o),qty=orderQuantity(o),parcels=orderParcelsCount(o),city=orderCity(o),payment=orderPaymentStatus(o),date=new Date(o.created_at).toLocaleDateString('en-US',{year:'numeric',month:'2-digit',day:'2-digit'});"
once(old_print,new_print,'print variables/date')

once('<div class="cell"><div class="label-title">الكمية</div><div class="value">${qty} قطع</div></div><div class="cell"><div class="label-title">التاريخ</div><div class="value">${esc(date)}</div></div>',
     '<div class="cell"><div class="label-title">عدد القطع</div><div class="value">${qty}</div></div><div class="cell"><div class="label-title">عدد الطرود</div><div class="value">${parcels}</div></div><div class="cell"><div class="label-title">التاريخ</div><div class="value">${esc(date)}</div></div>',
     'print qty/parcels')

once('Object.assign(window,{vendorLogin,vendorLogout,toggleTheme,openProductModal,closeProductModal,editProduct,saveProduct,deleteProduct,saveExchangeRate,loadOrders,printShippingLabel});',
     'Object.assign(window,{vendorLogin,vendorLogout,toggleTheme,openProductModal,closeProductModal,editProduct,saveProduct,deleteProduct,saveExchangeRate,loadOrders,printShippingLabel,openVendorOrderDetails,closeVendorOrderDetails});',
     'window exports')

p.write_text(s,encoding='utf-8')
