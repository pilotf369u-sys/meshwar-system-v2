from pathlib import Path

js=Path('js/external-shipping-native-order-render-v1.js')
s=js.read_text(encoding='utf-8')
s=s.replace("const VERSION='20260829-native-render-v38';","const VERSION='20260829-native-render-v39';")

old="const id=encodeURIComponent(String(o.id)),code=o.order_code||o.id,status=o.status||'انتظار رد الموظف',qty=o._quantity||adminOrderQuantity(o),price=product(o),url=adminOrderProductUrl(o),phone=o._customer_phone||o.customer_phone||'---',ext=fee(o),extCur=extCurrencyValue(o),due=collectionDue(o);bindInputValue('adminPrice-'+id,price);bindInputValue('adminExternalFee-'+id,ext);"
new="const id=encodeURIComponent(String(o.id)),code=o.order_code||o.id,status=o.status||'انتظار رد الموظف',qty=o._quantity||adminOrderQuantity(o),price=product(o),url=adminOrderProductUrl(o),phone=o._customer_phone||o.customer_phone||'---',ext=localFee(o),extCur=String(o.currency||'USD'),due=collectionDue(o);"
if old not in s: raise SystemExit('admin renderer marker missing')
s=s.replace(old,new,1)

old_input='<input id="adminPrice-${id}" type="number" min="0" step="0.01" value="${esc(price)}" placeholder="0">'
new_input='<input id="adminPrice-${id}" type="number" min="0" step="0.01" value="${esc(product(o))}" placeholder="0">'
if old_input not in s: raise SystemExit('admin price input missing')
s=s.replace(old_input,new_input,1)
old_fee='<input id="adminExternalFee-${id}" type="number" min="0" step="0.01" value="${esc(ext||\'\')}" placeholder="0">'
new_fee='<input id="adminExternalFee-${id}" type="number" min="0" step="0.01" value="${esc(localFee(o))}" placeholder="0">'
if old_fee not in s: raise SystemExit('admin shipping input missing')
s=s.replace(old_fee,new_fee,1)

# The admin shipping input is the native delivery_fee field. Save it back to the same source column.
old_payload="external_shipping_fee:Number.isFinite(extFee)?extFee:0,external_shipping_currency:extCur"
new_payload="delivery_fee:Number.isFinite(extFee)?extFee:0"
# only replace the admin occurrence (last occurrence)
pos=s.rfind(old_payload)
if pos < 0: raise SystemExit('admin save payload marker missing')
s=s[:pos]+s[pos:].replace(old_payload,new_payload,1)

js.write_text(s,encoding='utf-8')

shell=Path('external-shipping-shell.html')
t=shell.read_text(encoding='utf-8')
t=t.replace("const BUILD='20260829-admin-money-v38';","const BUILD='20260829-admin-money-v39';")
t=t.replace("js/external-shipping-native-order-render-v1.js?v=20260829-native-render-v38","js/external-shipping-native-order-render-v1.js?v=20260829-native-render-v39")
shell.write_text(t,encoding='utf-8')
