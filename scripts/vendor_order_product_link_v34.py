from pathlib import Path
import re

p=Path('vendor-dashboard-v2.html')
s=p.read_text(encoding='utf-8')

new_table='<div class="vendor-table-wrap"><table class="vendor-responsive-table text-sm"><colgroup><col style="width:9%"><col style="width:14%"><col style="width:16%"><col style="width:7%"><col style="width:8%"><col style="width:14%"><col style="width:11%"><col style="width:10%"><col style="width:11%"></colgroup><thead class="border-b border-white/10 text-slate-400"><tr><th>الصورة</th><th>رقم الطلب</th><th>المنتج</th><th>الكمية</th><th>عدد الطرود</th><th>المحافظة / المدينة</th><th>الحالة</th><th>رابط المنتج</th><th>الإجراء</th></tr></thead><tbody id="ordersBody"></tbody></table></div>'
s,n=re.subn(r'<div class="vendor-table-wrap"><table class="vendor-responsive-table text-sm">.*?<tbody id="ordersBody"></tbody></table></div>',new_table,s,count=1,flags=re.S)
if n!=1: raise SystemExit(f'orders table patch count={n}')

old="function orderProductName(o){const d=normalizeOrderDetails(o?.details);return d.product_name||'منتج محلي'}"
new="function orderProductName(o){const d=normalizeOrderDetails(o?.details);return d.product_name||'منتج محلي'}\nfunction vendorOrderProductImage(o){const d=normalizeOrderDetails(o?.details);return String(d.product_image||d.image_url||o?.image_url||'').trim()}\nfunction vendorOrderProductUrl(o){const d=normalizeOrderDetails(o?.details),sid=String(d.store_id||o?.store_id||vendorStore?.id||'').trim(),pid=String(d.product_id||o?.product_id||'').trim();if(sid&&pid)return `index.html?storeId=${encodeURIComponent(sid)}&productId=${encodeURIComponent(pid)}#localStoreProductsPanel`;return String(d.product_url||o?.product_url||o?.order_url||'').trim()}"
if 'function vendorOrderProductUrl(o)' not in s:
    if old not in s: raise SystemExit('orderProductName signature missing')
    s=s.replace(old,new,1)

start=s.find('function renderVendorOrders(){')
end=s.find('\nasync function loadOrders()',start)
if start<0 or end<0: raise SystemExit('renderVendorOrders boundaries missing')
new_render='''function renderVendorOrders(){const body=$(\'ordersBody\');if(!body)return;const visible=orders.filter(vendorOrderMatchesFilter);body.innerHTML=visible.map(o=>{const image=vendorOrderProductImage(o),url=vendorOrderProductUrl(o),thumb=image?`<img src="${esc(image)}" alt="${esc(orderProductName(o))}" class="mx-auto h-14 w-14 rounded-xl border border-amber-400/20 bg-white/5 object-contain p-1" onerror="this.style.display=\'none\'">`:\'---\',link=url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center justify-center rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs font-black text-amber-200 transition hover:bg-amber-500/20">🔗 فتح الرابط</a>`:\'---\';return `<tr class="border-b border-white/5"><td data-label="الصورة">${thumb}</td><td data-label="رقم الطلب"><div class="font-bold">${esc(o.order_code||String(o.id).slice(0,8))}</div><div class="vendor-muted text-xs text-slate-500">${new Date(o.created_at).toLocaleString(\'ar\')}</div></td><td data-label="المنتج">${esc(orderProductName(o))}</td><td data-label="الكمية">${orderQuantity(o)}</td><td data-label="عدد الطرود"><span class="rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-1 text-xs font-black text-amber-200">${orderParcelsCount(o)}</span></td><td data-label="المحافظة / المدينة">${esc(orderCity(o))}</td><td data-label="الحالة"><span class="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs">${esc(o.status||\'انتظار رد الموظف\')}</span></td><td data-label="رابط المنتج">${link}</td><td data-label="الإجراء"><div class="flex flex-wrap gap-2"><button type="button" onclick="printShippingLabel(\'${esc(o.id)}\')" class="rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-xs font-black text-sky-200 transition hover:bg-sky-500/20">🖨️ طباعة الملصق</button><button type="button" onclick="openVendorOrderDetails(\'${esc(o.id)}\')" class="rounded-lg border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-xs font-black text-violet-200 transition hover:bg-violet-500/20">تفاصيل</button></div></td></tr>`}).join(\'\')||\'<tr><td colspan="9" class="p-6 text-center text-slate-400">لا توجد طلبات ضمن هذا التصنيف.</td></tr>\'}'''
s=s[:start]+new_render+s[end:]

p.write_text(s,encoding='utf-8')
print('Vendor order product image + canonical direct link V34 applied')
