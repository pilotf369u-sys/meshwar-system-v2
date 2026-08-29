from pathlib import Path
p=Path('dashboard.html')
s=p.read_text(encoding='utf-8')
old='''<th>سعر السلعة</th><th>أجور الشحن الخارجي</th><th>المجموع الكلي</th>'''
new='''<th>سعر السلعة</th><th>أجور الشحن الخارجي</th><th>أجرة التوصيل المحلية</th><th>المجموع الكلي النهائي</th>'''
if old in s:
    s=s.replace(old,new,1)
old_func_start=s.index('function activeOrderRow(o,index){')
old_func_end=s.index('\nfunction historyOrderRow',old_func_start)
old_func=s[old_func_start:old_func_end]
new_func='''function activeOrderRow(o,index){const code=o.order_code||String(o.id),status=o.status||'انتظار رد الموظف',[bg,color]=orderStatusStyle(status),money=customerOrderMoneyBreakdown(o),productPrice=money.productTotal,externalShippingFee=money.externalShippingFee,deliveryFee=money.deliveryFee,grandTotal=money.grandTotal,currency=o.currency||'$',qty=o._quantity||getOrderQuantity(o),image=o.image_url?`<img src="${escapeHtml(o.image_url)}" class="order-thumb" onerror="this.style.display='none'">`:'---',url=getOrderProductUrl(o),link=url?`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">فتح الرابط</a>`:'---';return `<tr><td><b>${escapeHtml(code)}</b><br>${siparisDisplayHtml(getOrderSiparisNo(o))}<br><svg class="barcode-svg" data-order-barcode="${escapeHtml(code)}"></svg></td><td>${image}</td><td><span class="qty-badge">${escapeHtml(qty)}</span><div style="margin-top:6px;font-size:11px;font-weight:800;color:#475569">📦 الطرود: ${escapeHtml(getOrderParcelsCount(o))}</div></td><td>${o.created_at?new Date(o.created_at).toLocaleString('ar'):'---'}</td><td><span class="status-pill" style="background:${bg};color:${color}">${escapeHtml(status)}</span></td><td><b>${productPrice===null||!Number.isFinite(productPrice)?'---':productPrice.toFixed(2)+' '+escapeHtml(currency)}</b></td><td>${Number.isFinite(externalShippingFee)?externalShippingFee.toFixed(2)+' '+escapeHtml(currency):'0.00 '+escapeHtml(currency)}</td><td>${Number.isFinite(deliveryFee)?deliveryFee.toFixed(2)+' '+escapeHtml(currency):'0.00 '+escapeHtml(currency)}</td><td><b>${grandTotal===null||!Number.isFinite(grandTotal)?'---':grandTotal.toFixed(2)+' '+escapeHtml(currency)}</b></td><td><button class="btn-details" onclick="openCustomerOrderDetails(${index})">عرض</button></td><td>${link}</td><td>${customerDecisionHtml(o,index,grandTotal,currency)}</td></tr>`}'''
s=s[:old_func_start]+new_func+s[old_func_end:]
s=s.replace("activeBody.innerHTML='<tr><td class=\\\"empty-state\\\" colspan=\\\"9\\\">لا توجد طلبات نشطة حالياً.</td></tr>'","activeBody.innerHTML='<tr><td class=\\\"empty-state\\\" colspan=\\\"12\\\">لا توجد طلبات نشطة حالياً.</td></tr>'")
# tolerate literal quote form actually used in source
s=s.replace("activeBody.innerHTML='<tr><td class=\"empty-state\" colspan=\"9\">لا توجد طلبات نشطة حالياً.</td></tr>'","activeBody.innerHTML='<tr><td class=\"empty-state\" colspan=\"12\">لا توجد طلبات نشطة حالياً.</td></tr>'")
# Safety invariant: this patch only changes customer rendering; it must not introduce DB writes.
if '.update({total_price' in new_func or 'total_price:' in new_func:
    raise SystemExit('unsafe total_price write detected')
p.write_text(s,encoding='utf-8')
print('patched dashboard customer money columns v42')
