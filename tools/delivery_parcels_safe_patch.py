from pathlib import Path
p=Path('delivery-dashboard.html')
s=p.read_text(encoding='utf-8')

old="""<div class=\"finance\"><div class=\"finance-card\"><div class=\"label\">عدد الوصولات الحالية</div><div id=\"cardShipments\" class=\"value\">0</div></div><div class=\"finance-card\"><div class=\"label\">إجمالي المحصل</div><div id=\"cardCollected\" class=\"value\">0.00</div></div><div class=\"finance-card\"><div class=\"label\">أجرة التوصيل / العمولة</div><div id=\"cardFees\" class=\"value\">0.00</div></div><div class=\"finance-card\"><div class=\"label\">صافي الواجب تسليمه</div><div id=\"cardNet\" class=\"value\">0.00</div></div></div>"""
new="""<div class=\"finance\"><div class=\"finance-card\"><div class=\"label\">عدد الوصولات الحالية</div><div id=\"cardShipments\" class=\"value\">0</div></div><div class=\"finance-card\"><div class=\"label\">عدد القطع غير المصفاة</div><div id=\"cardPieces\" class=\"value\">0</div></div><div class=\"finance-card\"><div class=\"label\">عدد الطرود غير المصفاة</div><div id=\"cardParcels\" class=\"value\">0</div></div><div class=\"finance-card\"><div class=\"label\">إجمالي المحصل</div><div id=\"cardCollected\" class=\"value\">0.00</div></div><div class=\"finance-card\"><div class=\"label\">أجرة التوصيل / العمولة</div><div id=\"cardFees\" class=\"value\">0.00</div></div><div class=\"finance-card\"><div class=\"label\">صافي الواجب تسليمه</div><div id=\"cardNet\" class=\"value\">0.00</div></div></div>"""
if old not in s: raise SystemExit('finance cards anchor not found')
s=s.replace(old,new,1)

old="""function detailValue(o,key){return parseDetails(o.details)[key]||''}"""
new="""function detailValue(o,key){return parseDetails(o.details)[key]||''}\nfunction deliveryOrderQuantity(o){const d=parseDetails(o?.details),n=Number(d.quantity??o?.quantity??1);return Number.isFinite(n)&&n>0?Math.max(1,Math.floor(n)):1}\nfunction deliveryParcelsCount(o){const d=parseDetails(o?.details),n=Number(d.parcels_count??1);return Number.isFinite(n)&&n>=1?Math.max(1,Math.floor(n)):1}"""
if old not in s: raise SystemExit('detailValue anchor not found')
s=s.replace(old,new,1)

old="""<div><div class=\"code\">${esc(o.order_code||o.id)}</div><div class=\"muted\">${esc(o.reference_order_no||'')}</div></div>"""
new="""<div><div class=\"code\">${esc(o.order_code||o.id)}</div><div class=\"muted\">${esc(o.reference_order_no||'')}</div><div class=\"muted\" style=\"margin-top:4px;font-weight:800;color:#475569\">القطع: ${deliveryOrderQuantity(o)} &nbsp;|&nbsp; 📦 الطرود: ${deliveryParcelsCount(o)}</div></div>"""
if old not in s: raise SystemExit('shipment summary anchor not found')
s=s.replace(old,new,1)

old="""<div class=\"item\"><b>صافي العهدة</b><span class=\"money\">${money(deliveryNet(o),cur)}</span>${o.is_settled?'<div class=\"secondary\" style=\"color:#15803d\">مصفّى ماليًا</div>':''}</div></div>"""
new="""<div class=\"item\"><b>صافي العهدة</b><span class=\"money\">${money(deliveryNet(o),cur)}</span>${o.is_settled?'<div class=\"secondary\" style=\"color:#15803d\">مصفّى ماليًا</div>':''}</div><div class=\"item\"><b>عدد القطع</b><span style=\"font-weight:900\">${deliveryOrderQuantity(o)}</span></div><div class=\"item\"><b>عدد الطرود</b><span style=\"font-weight:900;color:#7c3aed\">${deliveryParcelsCount(o)}</span></div></div>"""
if old not in s: raise SystemExit('details grid anchor not found')
s=s.replace(old,new,1)

old="""async function loadFinance(){try{const rows=(await fetchCourierOrders('status,total_price,currency,delivery_fee,delivery_payment_type,is_settled,delivery_agent_id,courier_id,branch_id')).filter(o=>o.status==='تم التسليم'),unsettled=rows.filter(o=>o.is_settled!==true),by={};unsettled.forEach(o=>{const cur=o.currency||'بدون عملة';if(!by[cur])by[cur]={collected:0,fees:0,net:0};by[cur].collected+=doorCollection(o);by[cur].fees+=Number(o.delivery_fee||0);by[cur].net+=deliveryNet(o)});cardShipments.textContent=unsettled.length;const fmt=k=>Object.entries(by).map(([c,v])=>`${v[k].toFixed(2)} ${c}`).join(' / ')||'0.00';cardCollected.textContent=fmt('collected');cardFees.textContent=fmt('fees');cardNet.textContent=fmt('net')}catch(e){console.error('Delivery finance error:',e)}}"""
new="""async function loadFinance(){try{const rows=(await fetchCourierOrders('status,total_price,currency,delivery_fee,delivery_payment_type,is_settled,delivery_agent_id,courier_id,branch_id,details')).filter(o=>o.status==='تم التسليم'),unsettled=rows.filter(o=>o.is_settled!==true),by={};let pieces=0,parcels=0;unsettled.forEach(o=>{const cur=o.currency||'بدون عملة';if(!by[cur])by[cur]={collected:0,fees:0,net:0};by[cur].collected+=doorCollection(o);by[cur].fees+=Number(o.delivery_fee||0);by[cur].net+=deliveryNet(o);pieces+=deliveryOrderQuantity(o);parcels+=deliveryParcelsCount(o)});cardShipments.textContent=unsettled.length;cardPieces.textContent=pieces;cardParcels.textContent=parcels;const fmt=k=>Object.entries(by).map(([c,v])=>`${v[k].toFixed(2)} ${c}`).join(' / ')||'0.00';cardCollected.textContent=fmt('collected');cardFees.textContent=fmt('fees');cardNet.textContent=fmt('net')}catch(e){console.error('Delivery finance error:',e)}}"""
if old not in s: raise SystemExit('loadFinance anchor not found')
s=s.replace(old,new,1)

p.write_text(s,encoding='utf-8')
print('delivery dashboard parcels patch applied')
