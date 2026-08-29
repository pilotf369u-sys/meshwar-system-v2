from pathlib import Path

js=Path('js/external-shipping-native-order-render-v1.js')
s=js.read_text(encoding='utf-8')

s=s.replace("const VERSION='20260826-native-render-v1';","const VERSION='20260829-native-render-v38';")

needle="const product=o=>Math.max(0,num(o?.total_price));\n"
insert="const product=o=>Math.max(0,num(o?.total_price));\nconst bindInputValue=(id,value)=>queueMicrotask(()=>{const el=document.getElementById(id);if(el)el.value=(value===null||value===undefined||value==='')?'':String(value)});\n"
if insert not in s:
    if needle not in s: raise SystemExit('product marker missing')
    s=s.replace(needle,insert,1)

old_emp="const id=encodeURIComponent(cloudId(o.id)),qty=o._quantity||orderQuantity(o),hasPrice=o.total_price!==null&&o.total_price!==undefined&&o.total_price!==''&&num(o.total_price)>0,price=hasPrice?o.total_price:'',status=o.status||'انتظار رد الموظف',code=o.order_code||o.id,due=collectionDue(o),mainPhone=o._customer_phone||o.customer_phone||'',ext=fee(o),extCur=extCurrencyValue(o),pricingDisabled=can('pricing')?'':'disabled';"
new_emp="const id=encodeURIComponent(cloudId(o.id)),qty=o._quantity||orderQuantity(o),price=product(o),status=o.status||'انتظار رد الموظف',code=o.order_code||o.id,due=collectionDue(o),mainPhone=o._customer_phone||o.customer_phone||'',ext=fee(o),extCur=extCurrencyValue(o),pricingDisabled=can('pricing')?'':'disabled';bindInputValue('price-'+id,price);bindInputValue('externalFee-'+id,ext);"
if old_emp not in s: raise SystemExit('employee render marker missing')
s=s.replace(old_emp,new_emp,1)

old_admin="const id=encodeURIComponent(String(o.id)),code=o.order_code||o.id,status=o.status||'انتظار رد الموظف',qty=o._quantity||adminOrderQuantity(o),hasPrice=o.total_price!==null&&o.total_price!==undefined&&o.total_price!==''&&num(o.total_price)>0,price=hasPrice?o.total_price:'',url=adminOrderProductUrl(o),phone=o._customer_phone||o.customer_phone||'---',ext=fee(o),extCur=extCurrencyValue(o),due=collectionDue(o);"
new_admin="const id=encodeURIComponent(String(o.id)),code=o.order_code||o.id,status=o.status||'انتظار رد الموظف',qty=o._quantity||adminOrderQuantity(o),price=product(o),url=adminOrderProductUrl(o),phone=o._customer_phone||o.customer_phone||'---',ext=fee(o),extCur=extCurrencyValue(o),due=collectionDue(o);bindInputValue('adminPrice-'+id,price);bindInputValue('adminExternalFee-'+id,ext);"
if old_admin not in s: raise SystemExit('admin render marker missing')
s=s.replace(old_admin,new_admin,1)

js.write_text(s,encoding='utf-8')

shell=Path('external-shipping-shell.html')
t=shell.read_text(encoding='utf-8')
t=t.replace("const BUILD='20260827-customer-cms-video-v21.2.1';","const BUILD='20260829-admin-money-v38';")
t=t.replace("js/external-shipping-native-order-render-v1.js?v=20260826-native-render-v1","js/external-shipping-native-order-render-v1.js?v=20260829-native-render-v38")
shell.write_text(t,encoding='utf-8')

# trigger V38
