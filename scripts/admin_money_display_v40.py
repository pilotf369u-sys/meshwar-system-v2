from pathlib import Path

js=Path('js/external-shipping-native-order-render-v1.js')
s=js.read_text(encoding='utf-8')
s=s.replace("const VERSION='20260829-native-render-v39';","const VERSION='20260829-native-render-v40';")
# Admin must read the exact same shipping source as Employee: external_shipping_fee.
s=s.replace("phone=o._customer_phone||o.customer_phone||'---',ext=localFee(o),extCur=String(o.currency||'USD'),due=collectionDue(o);","phone=o._customer_phone||o.customer_phone||'---',ext=fee(o),extCur=extCurrencyValue(o),due=collectionDue(o);",1)
# Give admin money inputs the full cell width vertically so large values such as 46000/58000 are not visually clipped to trailing 00.
s=s.replace('<td><div class="mw-native-controls"><input id="adminPrice-${id}"','<td><div class="mw-native-controls mw-admin-money-controls"><input id="adminPrice-${id}"',1)
s=s.replace('<td><div class="mw-native-controls"><input id="adminExternalFee-${id}"','<td><div class="mw-native-controls mw-admin-money-controls"><input id="adminExternalFee-${id}"',1)
s=s.replace('value="${esc(product(o))}" placeholder="0">','value="${esc(price)}" placeholder="0">',1)
s=s.replace('value="${esc(localFee(o))}" placeholder="0">','value="${esc(ext||\'\')}" placeholder="0">',1)
# Save the same employee shipping fields, not delivery_fee.
s=s.replace("delivery_fee:Number.isFinite(extFee)?extFee:0};","external_shipping_fee:Number.isFinite(extFee)?extFee:0,external_shipping_currency:extCur};",1)
css='''\n/* V40 admin money fields: full numeric value must remain visible */\n#ordersListPanel .mw-admin-money-controls{display:flex!important;flex-direction:column!important;gap:3px!important}\n#ordersListPanel .mw-admin-money-controls input[type="number"]{direction:ltr!important;text-align:center!important;font-variant-numeric:tabular-nums!important;font-size:12px!important;padding-inline:2px!important;-moz-appearance:textfield!important}\n#ordersListPanel .mw-admin-money-controls input[type="number"]::-webkit-inner-spin-button,#ordersListPanel .mw-admin-money-controls input[type="number"]::-webkit-outer-spin-button{-webkit-appearance:none!important;margin:0!important}\n'''
needle='@media(max-width:1250px){'
if css.strip() not in s:
    s=s.replace(needle,css+needle,1)
js.write_text(s,encoding='utf-8')

shell=Path('external-shipping-shell.html')
t=shell.read_text(encoding='utf-8')
t=t.replace("const BUILD='20260829-admin-money-v39';","const BUILD='20260829-admin-money-v40';")
t=t.replace('js/external-shipping-native-order-render-v1.js?v=20260829-native-render-v39','js/external-shipping-native-order-render-v1.js?v=20260829-native-render-v40')
shell.write_text(t,encoding='utf-8')
