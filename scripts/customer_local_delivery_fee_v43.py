from pathlib import Path
p=Path('dashboard.html')
s=p.read_text(encoding='utf-8')
marker="function activeOrderRow(o,index){"
helper="""/* CUSTOMER_LOCAL_DELIVERY_FEE_V43 — presentation only; DB total_price remains unchanged */
function customerOrderMoneyBreakdown(o){
  const productTotalRaw=Number(o?.total_price),deliveryFeeRaw=Number(o?.delivery_fee);
  const productTotal=Number.isFinite(productTotalRaw)?productTotalRaw:null;
  const deliveryFee=Number.isFinite(deliveryFeeRaw)&&deliveryFeeRaw>0?deliveryFeeRaw:0;
  return {productTotal,deliveryFee,grandTotal:productTotal===null?null:productTotal+deliveryFee};
}
"""
if helper.strip() not in s:
    if marker not in s: raise SystemExit('activeOrderRow marker missing')
    s=s.replace(marker,helper+marker,1)
old="function activeOrderRow(o,index){const code=o.order_code||String(o.id),status=o.status||'انتظار رد الموظف',[bg,color]=orderStatusStyle(status),price=o.total_price===null||o.total_price===undefined||o.total_price===''?null:Number(o.total_price),currency=o.currency||'$'"
new="function activeOrderRow(o,index){const code=o.order_code||String(o.id),status=o.status||'انتظار رد الموظف',[bg,color]=orderStatusStyle(status),money=customerOrderMoneyBreakdown(o),price=money.grandTotal,currency=o.currency||'$'"
if old not in s: raise SystemExit('activeOrderRow price pattern missing')
s=s.replace(old,new,1)
start=s.index('function openCustomerOrderDetails(i){')
end=s.index('function closeCustomerOrderDetails()',start)
replacement="""function openCustomerOrderDetails(i){const o=currentCustomerOrdersGlobal[i];if(!o)return;const d=parseOrderDetails(o.details),money=customerOrderMoneyBreakdown(o),currency=escapeHtml(o.currency||'$'),siparis=getOrderSiparisNo(o),productLink=productLinkHtml(o),qty=o._quantity||getOrderQuantity(o),productTotal=money.productTotal===null?'---':escapeHtml(money.productTotal.toFixed(2))+' '+currency,deliveryFee=escapeHtml(money.deliveryFee.toFixed(2))+' '+currency,grandTotal=money.grandTotal===null?'---':escapeHtml(money.grandTotal.toFixed(2))+' '+currency;document.getElementById('customerOrderDetailsContent').innerHTML=`<p><b>رقم الطلب:</b> ${escapeHtml(o.order_code||o.id)}</p><p><b>Sipariş No:</b> ${escapeHtml(siparis||'---')}</p><p><b>الحالة:</b> ${escapeHtml(o.status||'')}</p><p><b>الكمية:</b> <span class=\"qty-badge\">${escapeHtml(qty)}</span></p><p><b>عدد الطرود:</b> <span class=\"qty-badge\">${escapeHtml(getOrderParcelsCount(o))}</span></p><hr><p><b>قيمة الطلب:</b> ${productTotal}</p><p><b>أجرة التوصيل المحلية:</b> ${deliveryFee}</p><p style=\"font-size:16px;font-weight:900\"><b>المجموع الكلي:</b> ${grandTotal}</p><p><b>سعر القطعة:</b> ${o._unit_price===null?'---':escapeHtml(o._unit_price.toFixed(2))+' '+currency}</p><p><b>الهاتف الاحتياطي المرتبط بالطلب:</b> ${o._secondary_phone?`<span dir=\"ltr\">${escapeHtml(o._secondary_phone)}</span>`:'---'}</p><p><b>اللون:</b> ${escapeHtml(d.color||'---')}</p><p><b>المقاس:</b> ${escapeHtml(d.size||'---')}</p><p><b>ملاحظات:</b> ${escapeHtml(d.notes||'---')}</p><p><b>رابط الطلب / المنتج:</b><br>${productLink}</p>`;document.getElementById('customerOrderDetailsModal').style.display='flex';}
"""
s=s[:start]+replacement+s[end:]
p.write_text(s,encoding='utf-8')
