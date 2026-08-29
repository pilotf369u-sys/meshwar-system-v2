from pathlib import Path
p=Path('dashboard.html')
s=p.read_text(encoding='utf-8')
old="""/* CUSTOMER_LOCAL_DELIVERY_FEE_V43 — presentation only; DB total_price remains unchanged */
function customerOrderMoneyBreakdown(o){
  const productTotalRaw=Number(o?.total_price),deliveryFeeRaw=Number(o?.delivery_fee);
  const productTotal=Number.isFinite(productTotalRaw)?productTotalRaw:null;
  const deliveryFee=Number.isFinite(deliveryFeeRaw)&&deliveryFeeRaw>0?deliveryFeeRaw:0;
  return {productTotal,deliveryFee,grandTotal:productTotal===null?null:productTotal+deliveryFee};
}
"""
new="""/* CUSTOMER_TRANSPARENT_INVOICE_V44 — presentation only; stored financial fields remain unchanged */
function customerOrderMoneyBreakdown(o){
  const productTotalRaw=Number(o?.total_price),externalShippingRaw=Number(o?.external_shipping_fee),deliveryFeeRaw=Number(o?.delivery_fee);
  const productTotal=Number.isFinite(productTotalRaw)?productTotalRaw:null;
  const externalShippingFee=Number.isFinite(externalShippingRaw)&&externalShippingRaw>0?externalShippingRaw:0;
  const deliveryFee=Number.isFinite(deliveryFeeRaw)&&deliveryFeeRaw>0?deliveryFeeRaw:0;
  return {productTotal,externalShippingFee,deliveryFee,grandTotal:productTotal===null?null:productTotal+externalShippingFee+deliveryFee};
}
"""
if old not in s: raise SystemExit('V43 helper not found')
s=s.replace(old,new,1)
old2="money=customerOrderMoneyBreakdown(o),currency=escapeHtml(o.currency||'$'),siparis=getOrderSiparisNo(o),productLink=productLinkHtml(o),qty=o._quantity||getOrderQuantity(o),productTotal=money.productTotal===null?'---':escapeHtml(money.productTotal.toFixed(2))+' '+currency,deliveryFee=escapeHtml(money.deliveryFee.toFixed(2))+' '+currency,grandTotal=money.grandTotal===null?'---':escapeHtml(money.grandTotal.toFixed(2))+' '+currency;"
new2="money=customerOrderMoneyBreakdown(o),currency=escapeHtml(o.currency||'$'),siparis=getOrderSiparisNo(o),productLink=productLinkHtml(o),qty=o._quantity||getOrderQuantity(o),productTotal=money.productTotal===null?'---':escapeHtml(money.productTotal.toFixed(2))+' '+currency,externalShippingFee=escapeHtml(money.externalShippingFee.toFixed(2))+' '+currency,deliveryFee=escapeHtml(money.deliveryFee.toFixed(2))+' '+currency,grandTotal=money.grandTotal===null?'---':escapeHtml(money.grandTotal.toFixed(2))+' '+currency;"
if old2 not in s: raise SystemExit('details money vars not found')
s=s.replace(old2,new2,1)
old3='<hr><p><b>قيمة الطلب:</b> ${productTotal}</p><p><b>أجرة التوصيل المحلية:</b> ${deliveryFee}</p><p style="font-size:16px;font-weight:900"><b>المجموع الكلي:</b> ${grandTotal}</p>'
new3='<hr><p><b>سعر السلعة:</b> ${productTotal}</p><p><b>أجور الشحن الخارجي:</b> ${externalShippingFee}</p><p><b>أجرة التوصيل المحلية:</b> ${deliveryFee}</p><p style="font-size:16px;font-weight:900"><b>المجموع الكلي النهائي:</b> ${grandTotal}</p>'
if old3 not in s: raise SystemExit('details invoice markup not found')
s=s.replace(old3,new3,1)
p.write_text(s,encoding='utf-8')
