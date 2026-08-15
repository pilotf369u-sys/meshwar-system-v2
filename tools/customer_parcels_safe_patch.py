from pathlib import Path
p=Path('dashboard.html')
s=p.read_text(encoding='utf-8')

old="""function getOrderQuantity(order){const d=parseOrderDetails(order?.details),raw=d.quantity??order?.quantity??1,n=Number(raw);return Number.isFinite(n)&&n>0?Math.max(1,n):1}"""
new="""function getOrderQuantity(order){const d=parseOrderDetails(order?.details),raw=d.quantity??order?.quantity??1,n=Number(raw);return Number.isFinite(n)&&n>0?Math.max(1,n):1}\nfunction getOrderParcelsCount(order){const d=parseOrderDetails(order?.details),raw=d.parcels_count??1,n=Number(raw);return Number.isFinite(n)&&n>=1?Math.max(1,Math.floor(n)):1}"""
if old not in s: raise SystemExit('quantity helper anchor not found')
s=s.replace(old,new,1)

old="""<td><span class=\"qty-badge\">${escapeHtml(qty)}</span></td>"""
new="""<td><span class=\"qty-badge\">${escapeHtml(qty)}</span><div style=\"margin-top:6px;font-size:11px;font-weight:800;color:#475569\">📦 الطرود: ${escapeHtml(getOrderParcelsCount(o))}</div></td>"""
if s.count(old) < 2: raise SystemExit('expected active/history quantity cells not found')
s=s.replace(old,new,2)

old="""document.getElementById('activeOrdersCount').innerText=activeCount+' طلب';document.getElementById('historyOrdersCount').innerText=historyCount+' طلب';renderCustomerOrderBarcodes();"""
new="""const activeParcels=currentCustomerOrdersGlobal.filter(o=>!isHistoryStatus(o.status)).reduce((sum,o)=>sum+getOrderParcelsCount(o),0),historyParcels=currentCustomerOrdersGlobal.filter(o=>isHistoryStatus(o.status)).reduce((sum,o)=>sum+getOrderParcelsCount(o),0);document.getElementById('activeOrdersCount').innerText=activeCount+' طلب • '+activeParcels+' طرد';document.getElementById('historyOrdersCount').innerText=historyCount+' طلب • '+historyParcels+' طرد';renderCustomerOrderBarcodes();"""
if old not in s: raise SystemExit('orders summary anchor not found')
s=s.replace(old,new,1)

old="""<p><b>الكمية:</b> <span class=\"qty-badge\">${escapeHtml(qty)}</span></p><p><b>السعر الكلي:</b>"""
new="""<p><b>الكمية:</b> <span class=\"qty-badge\">${escapeHtml(qty)}</span></p><p><b>عدد الطرود:</b> <span class=\"qty-badge\">${escapeHtml(getOrderParcelsCount(o))}</span></p><p><b>السعر الكلي:</b>"""
if old not in s: raise SystemExit('details quantity anchor not found')
s=s.replace(old,new,1)

p.write_text(s,encoding='utf-8')
print('customer dashboard parcels patch applied')
