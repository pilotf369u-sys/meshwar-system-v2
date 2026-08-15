from pathlib import Path
p=Path('vendor-dashboard.html')
s=p.read_text(encoding='utf-8')
old="Object.assign(window,{vendorLogin,vendorLogout,toggleTheme,openProductModal,closeProductModal,editProduct,saveProduct,deleteProduct,saveExchangeRate,loadOrders,printShippingLabel,openVendorOrderDetails,closeVendorOrderDetails,setVendorTab,setVendorOrderFilter});"
new="Object.assign(window,{vendorLogin,vendorLogout,toggleTheme,openProductModal,closeProductModal,editProduct,saveProduct,deleteProduct,saveExchangeRate,loadOrders,printShippingLabel,openVendorOrderDetails,closeVendorOrderDetails,setVendorTab,setVendorOrderFilter,setVendorFinanceFilter,exportVendorPaidStatement});\ndocument.querySelectorAll('[data-finance-filter]').forEach(btn=>{btn.addEventListener('click',()=>setVendorFinanceFilter(btn.dataset.financeFilter||'all'))});\nconst vendorPaidStatementBtn=document.querySelector('button[onclick=\"exportVendorPaidStatement()\"]');if(vendorPaidStatementBtn){vendorPaidStatementBtn.removeAttribute('onclick');vendorPaidStatementBtn.addEventListener('click',exportVendorPaidStatement)}"
if old not in s: raise SystemExit('Object.assign anchor not found')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
print('vendor finance events patch applied')
