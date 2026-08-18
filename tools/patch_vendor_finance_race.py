from pathlib import Path

p=Path('admin-dashboard.html')
s=p.read_text(encoding='utf-8')

old="let customerSupabase=null,currentAdminCloud=null,adminCustomersCloud=[],adminOrdersCloud=[],adminEmployeesCloud=[],adminBranches=[],adminRewardCustomers=[],adminCouriersForOrders=[];let adminVendorFinanceOrders=[],adminVendorStoresMap=new Map(),activeAdminVendorFinanceFilter='all',activeAdminVendorStoreFilter='all';"
new="let customerSupabase=null,currentAdminCloud=null,adminAccessVerificationPromise=null,adminCustomersCloud=[],adminOrdersCloud=[],adminEmployeesCloud=[],adminBranches=[],adminRewardCustomers=[],adminCouriersForOrders=[];let adminVendorFinanceOrders=[],adminVendorStoresMap=new Map(),activeAdminVendorFinanceFilter='all',activeAdminVendorStoreFilter='all';"
assert old in s, 'state declaration not found'
s=s.replace(old,new,1)

old="async function verifyAdminAccess(){const id=getAdminId();if(!id)throw new Error('لا توجد جلسة أدمن صالحة');const sb=await ensureCustomerSupabase(),{data,error}=await sb.from('employees').select('*').eq('id',id).maybeSingle();if(error)throw error;if(!data||normalizeRole(data.role)!=='admin')throw new Error('غير مصرح');currentAdminCloud=data;document.getElementById('adminNameLabel').innerText=data.name||'أدمن';updateAdminNavigationLinks()}async function initAdminDashboard(){try{await verifyAdminAccess();"
new="async function verifyAdminAccess(){const id=String(getAdminId()||'').trim();if(!id)throw new Error('لا توجد جلسة أدمن صالحة');if(currentAdminCloud&&String(currentAdminCloud.id)===id&&normalizeRole(currentAdminCloud.role)==='admin')return currentAdminCloud;if(!adminAccessVerificationPromise){adminAccessVerificationPromise=(async()=>{const sb=await ensureCustomerSupabase(),{data,error}=await sb.from('employees').select('*').eq('id',id).maybeSingle();if(error)throw error;if(!data||normalizeRole(data.role)!=='admin')throw new Error('غير مصرح');if(String(data.id)!==id)throw new Error('معرف الأدمن غير متطابق');currentAdminCloud=data;document.getElementById('adminNameLabel').innerText=data.name||'أدمن';updateAdminNavigationLinks();return data})().catch(e=>{adminAccessVerificationPromise=null;throw e})}return adminAccessVerificationPromise}async function checkAdminRole(){const admin=await verifyAdminAccess();if(!admin||normalizeRole(admin.role)!=='admin'||String(admin.id)!==String(getAdminId()||'').trim())throw new Error('غير مصرح بإدارة تسويات المتاجر.');return admin}async function initAdminDashboard(){try{await checkAdminRole();"
assert old in s, 'verify/init block not found'
s=s.replace(old,new,1)

old="async function loadAdminVendorFinance(){const body=document.getElementById('adminVendorFinanceBody');if(body)body.innerHTML='<tr><td colspan=\"6\">جاري التحميل...</td></tr>';try{if(normalizeRole(currentAdminCloud?.role)!=='admin')throw new Error('غير مصرح بإدارة تسويات المتاجر.');const sb=await ensureCustomerSupabase(),[or,sr]=await Promise.all(["
new="async function loadAdminVendorFinance(){const body=document.getElementById('adminVendorFinanceBody');if(body)body.innerHTML='<tr><td colspan=\"6\">جاري التحقق من صلاحية الأدمن وتحميل الحسابات...</td></tr>';try{await checkAdminRole();const sb=await ensureCustomerSupabase(),[or,sr]=await Promise.all(["
assert old in s, 'vendor finance loader block not found'
s=s.replace(old,new,1)

old="async function saveAdminVendorSettlement(encodedId){if(normalizeRole(currentAdminCloud?.role)!=='admin')return alert('غير مصرح.');const id=decodeURIComponent(encodedId),o=adminVendorFinanceOrders.find(x=>String(x.id)===String(id));"
new="async function saveAdminVendorSettlement(encodedId){try{await checkAdminRole()}catch(e){return alert(e.message||'غير مصرح.')}const id=decodeURIComponent(encodedId),o=adminVendorFinanceOrders.find(x=>String(x.id)===String(id));"
assert old in s, 'settlement permission block not found'
s=s.replace(old,new,1)

# Ensure section navigation waits on the same verified admin identity before finance loading.
old="if(section==='vendor-finance'){showSection('vendor-finance');if(typeof loadAdminVendorFinance==='function')loadAdminVendorFinance();return}"
new="if(section==='vendor-finance'){showSection('vendor-finance');if(typeof loadAdminVendorFinance==='function')await loadAdminVendorFinance();return}"
assert old in s, 'executive nav vendor finance block not found'
s=s.replace("setTimeout(()=>{try{if(section==='local-stores'", "setTimeout(async()=>{try{if(section==='local-stores'",1)
s=s.replace(old,new,1)

old="function showAdminMasterSection(sectionId){showSection(sectionId);setAdminMasterActive(sectionId);if(sectionId==='vendor-finance'&&typeof loadAdminVendorFinance==='function')loadAdminVendorFinance()}"
new="async function showAdminMasterSection(sectionId){showSection(sectionId);setAdminMasterActive(sectionId);if(sectionId==='vendor-finance'&&typeof loadAdminVendorFinance==='function')await loadAdminVendorFinance()}"
assert old in s, 'master section block not found'
s=s.replace(old,new,1)

p.write_text(s,encoding='utf-8')
print('patched admin-dashboard.html')
