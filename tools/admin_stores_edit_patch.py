from pathlib import Path

p=Path('admin-dashboard.html')
text=p.read_text(encoding='utf-8')

if 'js/global-stores-defaults.js' not in text:
    needle='</style></head>'
    if needle not in text: raise SystemExit('head marker not found')
    text=text.replace(needle,'</style><script src="js/global-stores-defaults.js"></script></head>',1)

start=text.index('<div class="card" id="stores">')
end=text.index('<div class="card" id="customers">',start)
store_html='''<div class="card" id="stores"><h3>إدارة المتاجر — Supabase</h3><div class="mini" style="margin-bottom:8px">إدارة موحدة للمتاجر العالمية الأساسية والمضافة سحابياً. يمكنك اختيار شعار جاهز من مجلد images/ أو لصق رابط خارجي.</div><input id="storeEditId" type="hidden"><input id="storeOriginalName" type="hidden"><input id="storeSortOrder" type="hidden"><input id="storeName" placeholder="اسم المتجر"><input id="storeUrl" dir="ltr" placeholder="رابط المتجر https://..."><input id="storeImg" type="text" dir="ltr" autocomplete="off" placeholder="رابط الشعار أو المسار المحلي: images/store.png" title="أدخل رابط https://... أو مسارًا من مجلد images/ مثل images/N11.png" style="min-width:320px"><select id="storeImageSelect" onchange="selectStoreImage(this.value)" style="min-width:250px"><option value="">اختر شعاراً من مجلد images/</option></select><select id="storeCategory"><option value="comprehensive">شاملة</option><option value="fashion">أزياء</option><option value="sports">رياضة</option><option value="beauty">تجميل</option><option value="home">منزل</option></select><button id="storeSaveBtn" class="btn-green" onclick="addStore()">+ إضافة</button><button id="storeCancelEditBtn" class="btn-dark" style="display:none" onclick="cancelStoreEdit()">إلغاء التعديل</button><div id="storesAdminNotice" class="mini" style="margin:8px 0"></div><div class="table-wrap"><table style="min-width:900px"><thead><tr><th>الشعار</th><th>المتجر</th><th>القسم</th><th>الرابط</th><th>الإجراءات</th></tr></thead><tbody id="storesTableBody"></tbody></table></div></div>
'''
text=text[:start]+store_html+text[end:]

fs=text.index('async function loadStoresAdmin(){')
fe=text.index('async function loadCloudSettings(){',fs)
functions=r'''let adminGlobalStoresMerged=[];
function adminStoreDefaults(){return Array.isArray(window.MeshwarGlobalStoreDefaults)?window.MeshwarGlobalStoreDefaults:[]}
function adminStoreKey(v){return String(v||'').trim().toLocaleLowerCase()}
function mergeAdminGlobalStores(cloud){
  const rows=Array.isArray(cloud)?cloud:[],byName=new Map(),bySort=new Map(),used=new Set();
  rows.forEach(s=>{byName.set(adminStoreKey(s.name),s);const n=Number(s.sort_order);if(n>=1&&n<=50&&!bySort.has(n))bySort.set(n,s)});
  const merged=adminStoreDefaults().map(d=>{const c=bySort.get(Number(d.sort_order))||byName.get(adminStoreKey(d.name));if(c){used.add(String(c.id));return{...d,...c,_baseline:true,_cloud:true}}return{...d,id:null,_baseline:true,_cloud:false,is_active:true}});
  rows.forEach(c=>{if(!used.has(String(c.id)))merged.push({...c,_baseline:false,_cloud:true})});
  return merged.sort((a,b)=>{const aa=Number(a.sort_order)>0?Number(a.sort_order):999999,bb=Number(b.sort_order)>0?Number(b.sort_order):999999;return aa-bb||String(a.name||'').localeCompare(String(b.name||''),'ar')});
}
function populateStoreImageOptions(){const el=document.getElementById('storeImageSelect');if(!el)return;const current=el.value,paths=[...new Set(adminStoreDefaults().map(x=>String(x.logo_url||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));el.innerHTML='<option value="">اختر شعاراً من مجلد images/</option>'+paths.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');if(paths.includes(current))el.value=current}
function selectStoreImage(value){if(value)document.getElementById('storeImg').value=value}
function syncStoreImageSelect(value){const el=document.getElementById('storeImageSelect');if(!el)return;const v=String(value||'').trim();if(v&&![...el.options].some(o=>o.value===v)){const o=document.createElement('option');o.value=v;o.textContent=v+' (مخصص)';el.appendChild(o)}el.value=v&&[...el.options].some(o=>o.value===v)?v:''}
function storeLogoPreview(s){const logo=String(s?.logo_url||'').trim();if(!/^(https?:\/\/|images\/)/i.test(logo))return'<span class="mini">بدون شعار</span>';return `<img src="${esc(logo)}" alt="${esc(s?.name||'')}" style="width:74px;height:48px;object-fit:contain;background:transparent" onerror="this.style.display='none'">`}
function resetStoreForm(){storeEditId.value='';storeOriginalName.value='';storeSortOrder.value='';storeName.value='';storeUrl.value='';storeImg.value='';storeCategory.value='comprehensive';storeSaveBtn.textContent='+ إضافة';storeCancelEditBtn.style.display='none';storesAdminNotice.textContent='';populateStoreImageOptions();storeImageSelect.value=''}
function cancelStoreEdit(){resetStoreForm()}
async function loadStoresAdmin(){
  populateStoreImageOptions();
  const sb=await ensureCustomerSupabase(),{data,error}=await sb.from('global_stores').select('*').order('sort_order',{ascending:true}).order('id',{ascending:true}).limit(1000);
  const cloud=error?[]:(data||[]);adminGlobalStoresMerged=mergeAdminGlobalStores(cloud);
  storesAdminNotice.textContent=error?'تعذر جلب global_stores؛ يتم عرض القائمة الأساسية مؤقتاً: '+String(error.message||error):`يعرض ${adminGlobalStoresMerged.length} متجرًا (${cloud.length} سجل سحابي + القائمة الأساسية عند الحاجة).`;
  storesTableBody.innerHTML=adminGlobalStoresMerged.map((s,i)=>{const canDelete=s.id!==null&&s.id!==undefined&&String(s.id)!=='';return `<tr><td>${storeLogoPreview(s)}</td><td><b>${esc(s.name||'')}</b>${s._cloud?'':'<div class="mini">أساسي — غير مزروع سحابياً بعد</div>'}</td><td>${esc(s.category||'')}</td><td><a href="${esc(s.store_url||'#')}" target="_blank" rel="noopener" style="color:#f6c85f;word-break:break-all">${esc(s.store_url||'')}</a></td><td><button class="btn-orange" onclick="editStore(${i})">✏️ تعديل</button> ${canDelete?`<button class="btn-red" onclick="deleteStore('${encodeURIComponent(String(s.id))}')">حذف</button>`:'<button class="btn-dark" disabled title="طبّق Seed أولاً ليصبح للمتجر سجل Supabase قابل للحذف">حذف</button>'}</td></tr>`}).join('')||'<tr><td colspan="5">لا توجد متاجر عالمية.</td></tr>';
}
function editStore(index){const s=adminGlobalStoresMerged[Number(index)];if(!s)return;storeEditId.value=s.id??'';storeOriginalName.value=s.name||'';storeSortOrder.value=Number(s.sort_order)||0;storeName.value=s.name||'';storeUrl.value=s.store_url||'';storeImg.value=s.logo_url||'';storeCategory.value=s.category||'comprehensive';syncStoreImageSelect(s.logo_url||'');storeSaveBtn.textContent='حفظ التعديل';storeCancelEditBtn.style.display='inline-block';storesAdminNotice.textContent=s.id?'وضع التعديل — سيتم تحديث السجل الحالي في Supabase.':'وضع التعديل — هذا متجر أساسي غير موجود سحابياً؛ سيتم إنشاء سجله تلقائياً ثم تطبيق التعديل.';storeName.focus()}
async function addStore(){
  const name=storeName.value.trim(),url=storeUrl.value.trim(),logo=storeImg.value.trim(),category=storeCategory.value,editId=String(storeEditId.value||'').trim(),originalName=String(storeOriginalName.value||'').trim();
  if(!name||!url)return alert('أدخل اسم المتجر والرابط.');
  const sb=await ensureCustomerSupabase();let sortOrder=Number(storeSortOrder.value)||0;if(!editId&&!originalName&&!sortOrder)sortOrder=Math.max(50,...adminGlobalStoresMerged.map(x=>Number(x.sort_order)||0))+1;
  const common={p_admin_id:getAdminId(),p_logo_url:logo,p_category:category,p_store_url:url,p_sort_order:sortOrder};
  if(editId){const{error}=await sb.rpc('update_global_store',{...common,p_store_id:Number(editId),p_name:name});if(error)return alert(error.message)}
  else if(originalName){const first=await sb.rpc('save_global_store',{...common,p_name:originalName});if(first.error)return alert(first.error.message);const savedId=Number(first.data);if(name!==originalName){const second=await sb.rpc('update_global_store',{...common,p_store_id:savedId,p_name:name});if(second.error)return alert(second.error.message)}}
  else{const{error}=await sb.rpc('save_global_store',{...common,p_name:name});if(error)return alert(error.message)}
  resetStoreForm();await loadStoresAdmin();
}
async function deleteStore(id){if(!confirm('حذف المتجر العالمي؟'))return;const decoded=Number(decodeURIComponent(id));const sb=await ensureCustomerSupabase(),{error}=await sb.rpc('delete_global_store',{p_admin_id:getAdminId(),p_store_id:decoded});if(error)return alert(error.message);if(String(storeEditId.value)===String(decoded))resetStoreForm();await loadStoresAdmin()}
'''
text=text[:fs]+functions+text[fe:]

old='addCurrency,deleteCur,addStore,deleteStore,savePricingSettings'
new='addCurrency,deleteCur,addStore,editStore,cancelStoreEdit,selectStoreImage,deleteStore,savePricingSettings'
if old not in text: raise SystemExit('Object.assign stores marker not found')
text=text.replace(old,new,1)

p.write_text(text,encoding='utf-8')
