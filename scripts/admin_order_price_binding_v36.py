from pathlib import Path

p=Path('admin-dashboard.html')
s=p.read_text(encoding='utf-8')

old="function normalizeAdminOrderMetrics(o){if(!o)return o;const q=adminOrderQuantity(o),raw=o.total_price,total=raw===null||raw===undefined||raw===''?null:Number(raw);o._quantity=q;o._total_price=Number.isFinite(total)?total:null;o._unit_price=o._total_price!==null&&q>0?o._total_price/q:null;return o}"
new="""function adminOrderBoundNumber(o,topKeys,detailKeys){const d=parseAdminOrderDetails(o?.details),pick=(obj,keys)=>{for(const k of keys){const raw=obj?.[k];if(raw===null||raw===undefined||raw==='')continue;const n=Number(raw);if(Number.isFinite(n))return n}return null},top=pick(o,topKeys),detail=pick(d,detailKeys);if((top===null||top===0)&&detail!==null&&detail!==0)return detail;return top!==null?top:detail}\nfunction normalizeAdminOrderMetrics(o){if(!o)return o;const q=adminOrderQuantity(o),total=adminOrderBoundNumber(o,['total_price','product_price','item_price'],['total_price','product_price','productPrice','item_price','itemPrice','price','item_total','product_total']),fee=adminOrderBoundNumber(o,['delivery_fee','shipping_fee','shipping_cost'],['delivery_fee','deliveryFee','shipping_fee','shippingFee','shipping_cost','shippingCost','delivery_cost','deliveryCost','freight_fee']);o._quantity=q;o._total_price=Number.isFinite(total)?total:null;o._delivery_fee=Number.isFinite(fee)?fee:null;if((o.total_price===null||o.total_price===undefined||o.total_price===''||Number(o.total_price)===0)&&o._total_price!==null)o.total_price=o._total_price;if((o.delivery_fee===null||o.delivery_fee===undefined||o.delivery_fee===''||Number(o.delivery_fee)===0)&&o._delivery_fee!==null)o.delivery_fee=o._delivery_fee;o._unit_price=o._total_price!==null&&q>0?o._total_price/q:null;return o}"""
if old not in s: raise SystemExit('normalizeAdminOrderMetrics target missing')
s=s.replace(old,new,1)

oldrow="function adminOrderRow(o){const id=encodeURIComponent(String(o.id)),code=o.order_code||o.id,status=o.status||'انتظار رد الموظف',qty=o._quantity||adminOrderQuantity(o),hasPrice=o.total_price!==null&&o.total_price!==undefined&&o.total_price!==''&&Number(o.total_price)>0,price=hasPrice?o.total_price:'',url=adminOrderProductUrl(o),phone=o._customer_phone||o.customer_phone||'---';return `"
newrow="function adminOrderRow(o){const id=encodeURIComponent(String(o.id)),code=o.order_code||o.id,status=o.status||'انتظار رد الموظف',qty=o._quantity||adminOrderQuantity(o),price=o._total_price!==null&&o._total_price!==undefined?o._total_price:'',deliveryFee=o._delivery_fee!==null&&o._delivery_fee!==undefined?o._delivery_fee:'',url=adminOrderProductUrl(o),phone=o._customer_phone||o.customer_phone||'---';return `"
if oldrow not in s: raise SystemExit('adminOrderRow prefix missing')
s=s.replace(oldrow,newrow,1)

oldcell='<td><input id="adminPrice-${id}" type="number" min="0" step="0.01" value="${esc(price)}" placeholder="0" style="width:90px"><select id="adminCurrency-${id}">${currencyOptions(o.currency)}</select><br><select id="adminPay-${id}">${payOptions(o.delivery_payment_type)}</select>'
newcell='<td><div class="mini" style="font-weight:900;margin-bottom:3px">سعر السلعة</div><input id="adminPrice-${id}" type="number" min="0" step="0.01" value="${esc(price)}" placeholder="0" style="width:90px"><select id="adminCurrency-${id}">${currencyOptions(o.currency)}</select><div class="mini" style="font-weight:900;margin:6px 0 3px">أجور الشحن</div><input id="adminDeliveryFee-${id}" type="number" min="0" step="0.01" value="${esc(deliveryFee)}" placeholder="0" style="width:90px"><br><select id="adminPay-${id}">${payOptions(o.delivery_payment_type)}</select>'
if oldcell not in s: raise SystemExit('admin price cell target missing')
s=s.replace(oldcell,newcell,1)

oldsave="reason=document.getElementById('adminReject-'+encodedId)?.value.trim()||null,raw=document.getElementById('adminPrice-'+encodedId)?.value??'',agentId="
newsave="reason=document.getElementById('adminReject-'+encodedId)?.value.trim()||null,raw=document.getElementById('adminPrice-'+encodedId)?.value??'',deliveryRaw=document.getElementById('adminDeliveryFee-'+encodedId)?.value??'',agentId="
if oldsave not in s: raise SystemExit('save raw binding target missing')
s=s.replace(oldsave,newsave,1)

needle="if(raw==='')payload.total_price=null;else{const n=Number(raw);if(!Number.isFinite(n)||n<0)return alert('أدخل مبلغاً صحيحاً');payload.total_price=n;payload.currency=document.getElementById('adminCurrency-'+encodedId)?.value||'$';if(n>0&&o.status==='انتظار رد الموظف'&&status==='انتظار رد الموظف'){status='بانتظار موافقة العميل';payload.status=status}}"
repl="if(raw==='')payload.total_price=null;else{const n=Number(raw);if(!Number.isFinite(n)||n<0)return alert('أدخل مبلغاً صحيحاً');payload.total_price=n;payload.currency=document.getElementById('adminCurrency-'+encodedId)?.value||'$';if(n>0&&o.status==='انتظار رد الموظف'&&status==='انتظار رد الموظف'){status='بانتظار موافقة العميل';payload.status=status}}if(deliveryRaw==='')payload.delivery_fee=null;else{const f=Number(deliveryRaw);if(!Number.isFinite(f)||f<0)return alert('أدخل أجور شحن صحيحة');payload.delivery_fee=f}"
if needle not in s: raise SystemExit('save price block missing')
s=s.replace(needle,repl,1)

oldmodal='<div class="detail-box"><b>السعر الكلي:</b> ${esc(o.total_price??\'---\')} ${esc(o.currency||\'\')}</div><div class="detail-box"><b>سعر القطعة:</b>'
newmodal='<div class="detail-box"><b>سعر السلعة:</b> ${esc(o._total_price??o.total_price??\'---\')} ${esc(o.currency||\'\')}</div><div class="detail-box"><b>أجور الشحن:</b> ${esc(o._delivery_fee??o.delivery_fee??\'---\')} ${esc(o.currency||\'\')}</div><div class="detail-box"><b>سعر القطعة:</b>'
if oldmodal not in s: raise SystemExit('details price target missing')
s=s.replace(oldmodal,newmodal,1)

p.write_text(s,encoding='utf-8')
print('admin order price/shipping binding V36 applied')
