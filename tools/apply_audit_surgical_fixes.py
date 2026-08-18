from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

SESSION_GUARDS = {
    'admin-dashboard.html': ('admin', 'adminId', False),
    'admin-branches.html': ('admin', 'adminId', False),
    'admin-branch-reports.html': ('admin', 'adminId', False),
    'local-stores-admin.html': ('admin', 'adminId', False),
    'branch-dashboard.html': ('branch', 'branchId', False),
    'delivery-dashboard.html': ('courier', 'courierId', False),
    'employee-dashboard.html': ('employee', 'employeeId', False),
    'dashboard.html': ('customer', 'customerId', True),
}


def read(name):
    return (ROOT / name).read_text(encoding='utf-8')


def write(name, text):
    (ROOT / name).write_text(text, encoding='utf-8')


def must_replace(text, old, new, label, count=1):
    found = text.count(old)
    if found < count:
        raise RuntimeError(f'{label}: expected at least {count}, found {found}')
    return text.replace(old, new, count)


def guard_script(role, id_key, allow_admin_impersonation=False):
    impersonation = """
  const adminImpersonation = expectedRole==='customer' && params.get('viewedBy')==='admin' && session?.role==='admin' && String(session?.id||'')===String(params.get('adminId')||'');
""" if allow_admin_impersonation else "  const adminImpersonation=false;\n"
    return f'''<script id="meshwar-session-guard-v1">
(function(){{
  const expectedRole={role!r}, idKey={id_key!r}, params=new URLSearchParams(location.search);
  let session=null;try{{session=JSON.parse(sessionStorage.getItem('meshwar_session')||'null')}}catch{{session=null}}
  const expectedId=String(params.get(idKey)||params.get(idKey==='customerId'?'id':'')||'').trim();
  const fresh=Number(session?.issuedAt||0)>0 && (Date.now()-Number(session.issuedAt)) < 12*60*60*1000;
{impersonation}  const valid=adminImpersonation || (!!session && fresh && session.role===expectedRole && expectedId && String(session.id||'')===expectedId);
  if(!valid){{try{{sessionStorage.removeItem('meshwar_session')}}catch{{}} location.replace('login.html'); if(window.stop)window.stop();}}
}})();
</script>'''


def add_guards():
    for name, (role, key, allow_admin) in SESSION_GUARDS.items():
        text = read(name)
        if 'meshwar-session-guard-v1' in text:
            continue
        marker = '</head>'
        if marker not in text:
            raise RuntimeError(f'{name}: </head> not found')
        text = text.replace(marker, guard_script(role, key, allow_admin) + '\n' + marker, 1)
        write(name, text)


def patch_login():
    name='login.html'; text=read(name)
    # Remove the insecure first-admin bootstrap path entirely.
    text, n = re.subn(r"async function hasAdminAccount\(\)\{.*?(?=async function findCustomerInSupabase)", "", text, count=1, flags=re.S)
    if n != 1:
        raise RuntimeError('login: bootstrap admin block not found exactly once')
    text = must_replace(
        text,
        "function cloudId(value){return value==null?'':String(value).trim()}",
        "function cloudId(value){return value==null?'':String(value).trim()}function saveMeshwarSession(role,id,extra={}){const sid=cloudId(id);if(!sid)return;const nonce=(globalThis.crypto&&crypto.randomUUID)?crypto.randomUUID():String(Date.now())+'-'+Math.random().toString(36).slice(2);sessionStorage.setItem('meshwar_session',JSON.stringify({role,id:sid,issuedAt:Date.now(),nonce,...extra}))}",
        'login session helper')
    old = "try{const boot=await bootstrapFirstAdmin(inputId,passwordInput);if(boot){location.href='admin-dashboard.html?adminId='+encodeURIComponent(cloudId(boot.id));return}const employee=await findEmployeeInSupabase(inputId);"
    text = must_replace(text, old, "try{const employee=await findEmployeeInSupabase(inputId);", 'login bootstrap call')
    replacements = [
        ("if(role==='admin'){location.href='admin-dashboard.html?adminId='+encodeURIComponent(cloudId(employee.id));return}", "if(role==='admin'){saveMeshwarSession('admin',employee.id);location.href='admin-dashboard.html?adminId='+encodeURIComponent(cloudId(employee.id));return}"),
        ("if(role==='employee'){location.href='employee-dashboard.html?employeeId='+encodeURIComponent(cloudId(employee.id));return}", "if(role==='employee'){saveMeshwarSession('employee',employee.id);location.href='employee-dashboard.html?employeeId='+encodeURIComponent(cloudId(employee.id));return}"),
        ("location.href='branch-dashboard.html?branchId='+encodeURIComponent(branchId);return", "saveMeshwarSession('branch',branchId);location.href='branch-dashboard.html?branchId='+encodeURIComponent(branchId);return"),
        ("location.href='delivery-dashboard.html?courierId='+encodeURIComponent(courierId)+'&branchId='+encodeURIComponent(branchId);return", "saveMeshwarSession('courier',courierId,{branchId});location.href='delivery-dashboard.html?courierId='+encodeURIComponent(courierId)+'&branchId='+encodeURIComponent(branchId);return"),
        ("saveCustomerSession(user);location.href='dashboard.html?customerId='+encodeURIComponent(cloudId(user.id));return", "saveCustomerSession(user);saveMeshwarSession('customer',user.id);location.href='dashboard.html?customerId='+encodeURIComponent(cloudId(user.id));return"),
        ("if(vendor){saveVendorSession(vendor);location.href='vendor-dashboard.html';return}", "if(vendor){saveVendorSession(vendor);saveMeshwarSession('vendor',vendor.id,{storeId:vendor.id});location.href='vendor-dashboard.html';return}"),
    ]
    for old,new in replacements:
        if old not in text:
            raise RuntimeError('login redirect pattern missing: '+old[:70])
        text=text.replace(old,new)
    # Clear stale role sessions whenever the unified login page is opened.
    text = must_replace(text, "const LOGIN_SUPABASE_URL=", "try{sessionStorage.removeItem('meshwar_session')}catch{}\nconst LOGIN_SUPABASE_URL=", 'login stale session reset')
    if 'bootstrapFirstAdmin' in text or 'hasAdminAccount' in text:
        raise RuntimeError('login: insecure bootstrap symbols remain')
    write(name,text)


def patch_admin_dashboard():
    name='admin-dashboard.html'; text=read(name)
    old="function showAdminMasterSection(sectionId){showSection(sectionId);setAdminMasterActive(sectionId);if(sectionId==='vendor-finance'&&typeof loadAdminVendorFinance==='function')loadAdminVendorFinance()}"
    new="function showAdminMasterSection(sectionId){showSection(sectionId);setAdminMasterActive(sectionId);const u=new URL(location.href);u.searchParams.set('section',sectionId);history.replaceState(null,'',u.pathname+u.search+u.hash);if(sectionId==='vendor-finance'&&typeof loadAdminVendorFinance==='function')loadAdminVendorFinance()}"
    text=must_replace(text,old,new,'admin section replaceState')
    text=text.replace("cur=localStorage.getItem('courierCurrency:'+String(a.id))||'$'","cur=String(a.currency||'$')")
    text=text.replace("delCurrency.value=localStorage.getItem('courierCurrency:'+String(a.id))||'$'","delCurrency.value=String(a.currency||'$')")
    old_payload="payload={branch_id:String(delBranch.value||'').trim(),name:delName.value.trim(),phone:delPhone.value.trim(),delivery_fee:feeNumber}"
    text=must_replace(text,old_payload,"payload={branch_id:String(delBranch.value||'').trim(),name:delName.value.trim(),phone:delPhone.value.trim(),delivery_fee:feeNumber,currency:selectedCurrency}",'admin courier currency payload')
    text=text.replace("localStorage.setItem('courierCurrency:'+savedId,selectedCurrency);","")
    # Legacy stores card must use the same local_stores source of truth as loadStoresAdmin().
    old_add="async function addStore(){const sb=await ensureCustomerSupabase(),{error}=await sb.from('stores').insert([{name:storeName.value.trim(),url:storeUrl.value.trim(),image_url:storeImg.value.trim(),category:storeCategory.value}]);if(error)return alert(error.message);loadStoresAdmin()}"
    new_add="async function addStore(){const sb=await ensureCustomerSupabase(),name=storeName.value.trim(),url=storeUrl.value.trim(),logo=storeImg.value.trim(),category=storeCategory.value;if(!name)return alert('أدخل اسم المتجر.');const payload={store_name:name,store_url:url||null,logo_url:logo||null,store_type:category||'شامل',specialty:category||'شامل',status:'active'};const{error}=await sb.from('local_stores').insert([payload]);if(error)return alert(error.message);loadStoresAdmin()}"
    text=must_replace(text,old_add,new_add,'admin local_stores add')
    old_del="async function deleteStore(id){const sb=await ensureCustomerSupabase();await sb.from('stores').delete().eq('id',decodeURIComponent(id));loadStoresAdmin()}"
    new_del="async function deleteStore(id){const sb=await ensureCustomerSupabase(),storeId=decodeURIComponent(id);if(!confirm('حذف المتجر المحلي؟'))return;const{error}=await sb.from('local_stores').delete().eq('id',storeId);if(error)return alert(error.message);loadStoresAdmin()}"
    text=must_replace(text,old_del,new_del,'admin local_stores delete')
    if "courierCurrency:" in text:
        raise RuntimeError('admin-dashboard: local courier currency storage reference remains')
    write(name,text)


def patch_branch_currency():
    name='branch-dashboard.html'; text=read(name)
    text=text.replace("cur=localStorage.getItem('courierCurrency:'+id)||'$'","cur=String(x.currency||'$')")
    # Known edit form variants.
    text=text.replace("courierCurrency.value=localStorage.getItem('courierCurrency:'+id)||'$'","courierCurrency.value=String(x.currency||'$')")
    text=text.replace("courierCurrency.value=localStorage.getItem('courierCurrency:'+cloudId(x.id))||'$'","courierCurrency.value=String(x.currency||'$')")
    # Add currency to courier insert/update payloads when a courier currency control exists.
    text=text.replace("delivery_fee:Number(courierFee.value||0),is_active:true}","delivery_fee:Number(courierFee.value||0),currency:String(courierCurrency?.value||'$'),is_active:true}")
    text=text.replace("delivery_fee:Number(courierFee.value||0)}","delivery_fee:Number(courierFee.value||0),currency:String(courierCurrency?.value||'$')}")
    text=text.replace("delivery_fee:Number(courierFee.value||0),", "delivery_fee:Number(courierFee.value||0),currency:String(courierCurrency?.value||'$'),", 1) if "currency:String(courierCurrency?.value||'$')" not in text and 'courierCurrency' in text else text
    text=re.sub(r"localStorage\.setItem\('courierCurrency:'\+[^;]+;", "", text)
    remaining=[text[max(0,m.start()-100):m.end()+120] for m in re.finditer('courierCurrency:',text)]
    if remaining:
        raise RuntimeError('branch-dashboard courier currency localStorage remains:\n'+'\n---\n'.join(remaining[:5]))
    if 'courierCurrency' in text and "currency:String(courierCurrency" not in text:
        raise RuntimeError('branch-dashboard: currency control exists but cloud payload was not patched')
    write(name,text)


def patch_local_stores_admin_session_logout():
    # No CRUD changes here; this is already the canonical local_stores UI.
    pass


def main():
    patch_login()
    patch_admin_dashboard()
    patch_branch_currency()
    add_guards()
    # Guard assertions.
    for name in SESSION_GUARDS:
        if 'meshwar-session-guard-v1' not in read(name):
            raise RuntimeError(f'{name}: session guard missing')
    print('Applied audit surgical fixes successfully.')

if __name__ == '__main__':
    main()
