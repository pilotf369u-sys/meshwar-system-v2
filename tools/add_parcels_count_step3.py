from pathlib import Path

# Employee dashboard: helper, row input, safe details persistence, modal display.
p=Path('employee-dashboard.html')
s=p.read_text(encoding='utf-8')

old="function cloudId(v){return v==null?'':String(v).trim()}function isCloudUuid"
new="function cloudId(v){return v==null?'':String(v).trim()}function orderParcelsCount(o){const d=parseDetails(o?.details),n=Number(d?.parcels_count??1);return Number.isFinite(n)&&n>=1?Math.max(1,Math.floor(n)):1}function isCloudUuid"
if old not in s: raise SystemExit('employee helper target not found')
s=s.replace(old,new,1)

old="<select id=\"status-${id}\" onchange=\"document.getElementById('courier-${id}').style.display=this.value==='مندوب'?'block':'none'\">${statusOptions(status)}</select><select id=\"courier-${id}\" style=\"margin-top:6px;display:${status==='مندوب'?'block':'none'}\">${courierOptionsForOrder(o)}</select>"
new="<select id=\"status-${id}\" onchange=\"document.getElementById('courier-${id}').style.display=this.value==='مندوب'?'block':'none';document.getElementById('parcels-wrap-${id}').style.display=this.value==='تجهيز شحن'?'block':'none'\">${statusOptions(status)}</select><select id=\"courier-${id}\" style=\"margin-top:6px;display:${status==='مندوب'?'block':'none'}\">${courierOptionsForOrder(o)}</select><div id=\"parcels-wrap-${id}\" style=\"margin-top:6px;display:${status==='تجهيز شحن'?'block':'none'}\"><label class=\"mini\" style=\"display:block;margin-bottom:3px;font-weight:800\">عدد الطرود</label><input id=\"parcels-${id}\" type=\"number\" min=\"1\" step=\"1\" value=\"${orderParcelsCount(o)}\" style=\"width:72px;text-align:center\"></div>"
if old not in s: raise SystemExit('employee status cell target not found')
s=s.replace(old,new,1)

old="if(status!=='رفض الطلب'&&Object.prototype.hasOwnProperty.call(o,'rejection_reason'))payload.rejection_reason=null;try{"
new="if(status!=='رفض الطلب'&&Object.prototype.hasOwnProperty.call(o,'rejection_reason'))payload.rejection_reason=null;const parcelsRaw=document.getElementById('parcels-'+encodedId)?.value??orderParcelsCount(o),parcelsCount=Math.max(1,Math.floor(Number(parcelsRaw)||1)),nextDetails={...parseDetails(o.details),parcels_count:parcelsCount};payload.details=JSON.stringify(nextDetails);try{"
if old not in s: raise SystemExit('employee save target not found')
s=s.replace(old,new,1)

old="<div class=\"detail-box\"><b>الكمية:</b> <span class=\"qty-badge\">${escapeHtml(o._quantity||orderQuantity(o))}</span></div><div class=\"detail-box\" style=\"grid-column:1/-1\"><b>رابط الطلب / المنتج:</b>"
new="<div class=\"detail-box\"><b>الكمية:</b> <span class=\"qty-badge\">${escapeHtml(o._quantity||orderQuantity(o))}</span></div><div class=\"detail-box\"><b>عدد الطرود:</b> <span class=\"qty-badge\">${escapeHtml(orderParcelsCount(o))}</span></div><div class=\"detail-box\" style=\"grid-column:1/-1\"><b>رابط الطلب / المنتج:</b>"
if old not in s: raise SystemExit('employee modal target not found')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')

# Admin dashboard: helper + modal display only.
p=Path('admin-dashboard.html')
s=p.read_text(encoding='utf-8')
old="function openOrderDetailsModalData(encodedId){const id=decodeURIComponent(encodedId),o=adminOrdersCloud.find(x=>String(x.id)===String(id));if(!o)return;const d=parseAdminOrderDetails(o.details),productLink=adminProductLinkHtml(o),qty=o._quantity||adminOrderQuantity(o),phone=o._customer_phone||o.customer_phone||'---';"
new="function adminOrderParcelsCount(o){const d=parseAdminOrderDetails(o?.details),n=Number(d?.parcels_count??1);return Number.isFinite(n)&&n>=1?Math.max(1,Math.floor(n)):1}function openOrderDetailsModalData(encodedId){const id=decodeURIComponent(encodedId),o=adminOrdersCloud.find(x=>String(x.id)===String(id));if(!o)return;const d=parseAdminOrderDetails(o.details),productLink=adminProductLinkHtml(o),qty=o._quantity||adminOrderQuantity(o),phone=o._customer_phone||o.customer_phone||'---';"
if old not in s: raise SystemExit('admin helper target not found')
s=s.replace(old,new,1)
old="<div class=\"detail-box\"><b>الكمية:</b> <span class=\"qty-badge\">${esc(qty)}</span></div><div class=\"detail-box\"><b>ملاحظات:</b>"
new="<div class=\"detail-box\"><b>الكمية:</b> <span class=\"qty-badge\">${esc(qty)}</span></div><div class=\"detail-box\"><b>عدد الطرود:</b> <span class=\"qty-badge\">${esc(adminOrderParcelsCount(o))}</span></div><div class=\"detail-box\"><b>ملاحظات:</b>"
if old not in s: raise SystemExit('admin modal target not found')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
