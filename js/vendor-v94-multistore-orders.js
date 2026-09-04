/* KINTO V95 — secure order_store_segments bridge with legacy fallback. */
(()=>{'use strict';
const SESSION_KEY='meshwar_vendor_session_v95';
const parse=v=>{if(!v)return{};if(typeof v==='object')return v;try{return JSON.parse(v)}catch{return{}}};
const html=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const runtime=window.MeshwarVendorRuntime;
if(!runtime){console.error('Vendor V95 runtime bridge unavailable');return}
const detailCache=new Map();

function session(){try{const value=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');if(!value?.token)return null;if(value.expiresAt&&Date.parse(value.expiresAt)<=Date.now()){sessionStorage.removeItem(SESSION_KEY);return null}return value}catch{return null}}
function saveSession(payload){sessionStorage.setItem(SESSION_KEY,JSON.stringify({token:payload.session_token,expiresAt:payload.expires_at}))}
function clearSession(){sessionStorage.removeItem(SESSION_KEY)}
function storeSubtotal(list){return list.reduce((n,x)=>n+(Number(x.line_total_local)||((Number(x.unit_price_local)||0)*Math.max(1,Number(x.quantity)||1))),0)}

function projectLegacyOrder(o,storeId){
  const d=parse(o?.details),source=String(d.source||'');
  if(source==='local_store')return String(d.store_id||'').trim()===storeId?{...o,_v95Source:'legacy-local'}:null;
  if(source!=='local_cart_bundle')return null;
  const list=Array.isArray(d.items)?d.items.filter(x=>String(x?.store_id||'').trim()===storeId):[];
  if(!list.length)return null;
  const storeMeta=Array.isArray(d.stores)?d.stores.find(s=>String(s?.store_id||'').trim()===storeId):null;
  const subtotal=storeSubtotal(list),qty=list.reduce((n,x)=>n+Math.max(1,Number(x.quantity)||1),0),storedStatus=String(d.store_statuses?.[storeId]||'بانتظار التسديد'),paid=String(d.bundle_stock_lifecycle_state||'')==='deducted'||String(o.status||'')==='تم التسديد',first=list[0]||{};
  return {...o,total_price:subtotal,status:paid?storedStatus:String(o.status||'انتظار رد الموظف'),details:{source:'local_store',v94_vendor_projection:true,store_id:storeId,store_name:storeMeta?.store_name||first.store_name||'المتجر',items:list,product_id:first.product_id||'',product_name:first.product_name||'',product_image:first.product_image||'',quantity:qty,requested_quantity:qty,store_subtotal:subtotal,pricing_snapshot:first.pricing_snapshot||null,commission_rate:Number(first.pricing_snapshot?.commission_rate)||Number(d.commission_rate)||0,vendor_payment_status:d.vendor_payment_status||d.vendor_settlement_status||'pending'},_v94GlobalOrder:true,_v94Paid:paid,_v94StoreStatus:storedStatus,_v95Source:'legacy-global'};
}

function projectSegment(row,storeId){
  const list=Array.isArray(row.items_preview)?row.items_preview:[],first=list[0]||{};
  return {id:row.segment_id,_v95SegmentId:row.segment_id,_v95OrderId:row.order_id,_v95Source:'segment',order_code:row.order_code,reference_order_no:row.reference_order_no,total_price:Number(row.subtotal_local)||0,currency:row.currency||first.currency||'IQD',status:row.store_status||'بانتظار التسديد',created_at:row.order_created_at||row.confirmed_at,details:{source:'local_store',v94_vendor_projection:true,store_id:storeId,store_name:first.store_name||runtime.getStore()?.store_name||'المتجر',items:list,product_id:first.product_id||'',product_name:first.product_name||'',product_image:first.product_image||'',quantity:Number(row.quantity_total)||0,requested_quantity:Number(row.quantity_total)||0,store_subtotal:Number(row.subtotal_local)||0,vendor_payment_status:row.vendor_payment_status||'pending'},_v94GlobalOrder:true,_v94Paid:true,_v94StoreStatus:row.store_status||'بانتظار التسديد'};
}

async function fetchLegacy(storeId){
  const{data,error}=await runtime.sb.from('orders').select('id,order_code,reference_order_no,total_price,currency,status,created_at,details').order('created_at',{ascending:false}).limit(500);
  if(error)throw error;
  return(data||[]).map(o=>projectLegacyOrder(o,storeId)).filter(Boolean);
}

async function loadSegmentOrders(){
  const store=runtime.getStore();if(!store)return;
  const storeId=String(store.id||'').trim();if(!storeId)throw new Error('معرّف المتجر الحالي غير صالح.');
  const active=session();
  try{
    let rows;
    if(active){
      const[{data,error},legacy]=await Promise.all([runtime.sb.rpc('vendor_list_order_segments',{p_session_token:active.token,p_limit:200,p_offset:0}),fetchLegacy(storeId)]);
      if(error)throw error;
      const segments=(data||[]).map(row=>projectSegment(row,storeId)),segmentOrderIds=new Set(segments.map(o=>String(o._v95OrderId||'')));
      rows=[...segments,...legacy.filter(o=>o._v95Source==='legacy-local'||(o._v95Source==='legacy-global'&&o._v94Paid&&!segmentOrderIds.has(String(o.id))))];
    }else rows=await fetchLegacy(storeId);
    runtime.setOrders(rows);renderOrders();runtime.renderFinance();runtime.renderStats();window.MeshwarVendorOrderStatusContrastV18?.decorateStatuses(window);
  }catch(e){
    if(active&&String(e?.message||'').includes('VENDOR_SESSION_INVALID')){clearSession();runtime.showNotice('انتهت جلسة المتجر الآمنة. سجّل الخروج ثم ادخل مجدداً لتفعيل الربط الجديد.',true)}
    console.error('Vendor V95 segment load error',e);
    try{const fallback=await fetchLegacy(storeId);runtime.setOrders(fallback);renderOrders();runtime.renderFinance();runtime.renderStats()}catch(fallbackError){runtime.showNotice('تعذر تحميل طلبات المتجر: '+(fallbackError.message||fallbackError),true)}
  }
}

function nextStatus(o){if(!o._v94Paid)return '';const flow=['بانتظار التسديد','قيد التجهيز','جاهز للتسليم للمندوب','تم التسليم للمندوب'],current=String(o._v94StoreStatus||o.status||''),index=flow.indexOf(current);return index>=0&&index<flow.length-1?flow[index+1]:''}
function actionButtons(o){const next=nextStatus(o),status=next?`<button type="button" onclick="setV94VendorStoreStatus('${html(o.id)}','${html(next)}')" class="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs font-black text-emerald-200">${html(next)}</button>`:'';return `<div class="flex flex-wrap gap-2"><button type="button" onclick="printShippingLabel('${html(o.id)}')" class="rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-xs font-black text-sky-200">🖨️ طباعة الملصق</button><button type="button" onclick="openV94VendorOrderDetails('${html(o.id)}')" class="rounded-lg border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-xs font-black text-violet-200">تفاصيل</button>${status}</div>`}

function renderOrders(){
  const orders=runtime.getOrders();if(!orders.some(o=>o?._v94GlobalOrder))return runtime.nativeRenderVendorOrders();
  const body=document.getElementById('ordersBody');if(!body)return;runtime.updateVendorOrderCounters();
  const visible=orders.filter(runtime.vendorOrderMatchesFilter);
  body.innerHTML=visible.map(o=>{const d=parse(o.details),list=Array.isArray(d.items)?d.items:[],first=list[0]||{},names=list.slice(0,2).map(x=>x.product_name).filter(Boolean).join('، ')+(list.length>2?` +${list.length-2}`:''),image=first.product_image||'',thumb=image?`<img src="${html(image)}" class="mx-auto h-14 w-14 rounded-xl border border-amber-400/20 bg-white/5 object-contain p-1">`:'---',productUrl=d.store_id&&first.product_id?`index.html?storeId=${encodeURIComponent(d.store_id)}&productId=${encodeURIComponent(first.product_id)}#localStoreProductsPanel`:'';return `<tr class="border-b border-white/5"><td data-label="الصورة">${thumb}</td><td data-label="رقم الطلب"><div class="font-bold">${html(o.order_code||String(o.id).slice(0,8))}</div><div class="vendor-muted text-xs text-slate-500">${new Date(o.created_at).toLocaleString('ar')}</div></td><td data-label="المنتج">${html(names||d.product_name||'---')}</td><td data-label="الكمية">${Number(d.quantity||0)}</td><td data-label="عدد الطرود"><span class="rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-1 text-xs font-black text-amber-200">1</span></td><td data-label="المحافظة / المدينة">---</td><td data-label="الحالة"><span class="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs">${html(o.status||'')}</span></td><td data-label="رابط المنتج">${productUrl?`<a href="${html(productUrl)}" target="_blank" rel="noopener noreferrer" class="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs font-black text-amber-200">🔗 فتح الرابط</a>`:'---'}</td><td data-label="الإجراء">${actionButtons(o)}</td></tr>`}).join('')||'<tr><td colspan="9" class="p-6 text-center text-slate-400">لا توجد طلبات تخص هذا المتجر ضمن التصنيف.</td></tr>';
}

async function openDetails(id){
  const o=runtime.getOrders().find(x=>String(x.id)===String(id));if(o&&!o._v94GlobalOrder)return runtime.nativeOpenVendorOrderDetails(id);if(!o)return runtime.showNotice('تعذر العثور على حصة المتجر.',true);
  let secureDetails=null,active=session();
  if(o._v95SegmentId&&active){
    try{if(detailCache.has(String(o.id)))secureDetails=detailCache.get(String(o.id));else{const{data,error}=await runtime.sb.rpc('vendor_get_order_segment_details',{p_session_token:active.token,p_segment_id:o._v95SegmentId});if(error)throw error;secureDetails=data;detailCache.set(String(o.id),data)}}catch(e){runtime.showNotice('تعذر تحميل تفاصيل حصة المتجر: '+(e.message||e),true);return}
  }
  const d=parse(o.details),list=Array.isArray(secureDetails?.items)?secureDetails.items:(Array.isArray(d.items)?d.items:[]),customer=parse(secureDetails?.customer);let modal=document.getElementById('vendorOrderDetailsModal');
  if(!modal){modal=document.createElement('div');modal.id='vendorOrderDetailsModal';modal.className='fixed inset-0 z-[80] hidden items-center justify-center bg-black/80 p-4 backdrop-blur-sm';modal.innerHTML='<div class="glass w-full max-w-2xl rounded-3xl p-5"><div class="mb-4 flex items-center justify-between"><h3 class="vendor-text text-lg font-black">تفاصيل الطلب</h3><button type="button" class="rounded-lg bg-rose-500 px-3 py-1 font-black" onclick="closeVendorOrderDetails()">×</button></div><div id="vendorOrderDetailsBody"></div></div>';document.body.appendChild(modal)}
  const rows=list.map((x,i)=>{const q=Math.max(1,Number(x.quantity)||1),line=Number(x.line_total_local)||((Number(x.unit_price_local)||0)*q);return `<div class="mb-2 grid grid-cols-[56px_1fr_auto] items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">${x.product_image?`<img src="${html(x.product_image)}" class="h-12 w-12 rounded-lg object-contain">`:'<div></div>'}<div><b>${i+1}. ${html(x.product_name||'المنتج')}</b><div class="vendor-muted text-xs">الكمية: ${q}</div></div><b dir="ltr">${runtime.money(line,x.currency||o.currency)}</b></div>`}).join('');
  const customerCard=secureDetails?`<div class="mb-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm"><b class="mb-2 block">معلومات العميل</b><div>الاسم: ${html(customer.name||customer.customer_name||'---')}</div><div>كود العميل: ${html(customer.customer_code||customer.code||'---')}</div><div dir="ltr" class="text-right">الهاتف: ${html(customer.phone||customer.customer_phone||'---')}</div><div dir="ltr" class="text-right">الهاتف الاحتياطي: ${html(customer.secondary_phone||customer.phone2||'---')}</div><div>الدولة: ${html(customer.country||'---')}</div><div>المحافظة: ${html(customer.province||customer.governorate||customer.city||'---')}</div><div>العنوان التفصيلي: ${html(customer.address||customer.address_details||customer.full_address||'---')}</div></div>`:'';
  document.getElementById('vendorOrderDetailsBody').innerHTML=`<div class="mb-3 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3"><div class="vendor-muted text-xs">رقم الطلب المشترك</div><b dir="ltr">${html(secureDetails?.order_code||o.order_code||o.id)}</b><div class="vendor-muted mt-1 text-xs" dir="ltr">Sipariş No: ${html(secureDetails?.reference_order_no||o.reference_order_no||'---')}</div><div class="mt-2 flex justify-between"><span>حصة متجري فقط</span><strong dir="ltr">${runtime.money(secureDetails?.subtotal_local??o.total_price,secureDetails?.currency||o.currency||runtime.financeCurrency())}</strong></div></div>${customerCard}${rows}<div class="mt-3 flex flex-wrap gap-2">${nextStatus(o)?actionButtons(o):''}</div>`;modal.classList.remove('hidden');modal.classList.add('flex');
}

async function setStatus(id,next){
  const o=runtime.getOrders().find(x=>String(x.id)===String(id)),active=session();if(!o)return runtime.showNotice('تعذر العثور على حصة المتجر.',true);
  if(o._v95SegmentId&&active){const expected=String(o._v94StoreStatus||o.status||''),{error}=await runtime.sb.rpc('vendor_advance_order_segment_status',{p_session_token:active.token,p_segment_id:o._v95SegmentId,p_expected_status:expected,p_next_status:next});if(error){runtime.showNotice('تعذر تحديث الحالة: '+(error.message||error),true);await loadSegmentOrders();return}runtime.showNotice('تم تحديث حالة حصة المتجر إلى: '+next);runtime.closeVendorOrderDetails();await loadSegmentOrders();return}
  return legacySetStatus(o,next);
}

async function legacySetStatus(o,next){const storeId=String(runtime.getStore()?.id||''),orderId=o._v95OrderId||o.id;try{const{data,error}=await runtime.sb.from('orders').select('id,status,details').eq('id',orderId).limit(1);if(error)throw error;const row=Array.isArray(data)?data[0]:null,d=parse(row?.details),paid=String(d.bundle_stock_lifecycle_state||'')==='deducted'||String(row?.status||'')==='تم التسديد';if(!row||!paid||!Array.isArray(d.items)||!d.items.some(x=>String(x.store_id)===storeId))throw new Error('الطلب غير صالح للتحديث');d.store_statuses={...(d.store_statuses||{}),[storeId]:next};const{error:updateError}=await runtime.sb.from('orders').update({details:JSON.stringify(d)}).eq('id',orderId);if(updateError)throw updateError;runtime.showNotice('تم تحديث حالة حصة المتجر إلى: '+next);runtime.closeVendorOrderDetails();await loadSegmentOrders()}catch(e){runtime.showNotice('تعذر تحديث حالة حصة المتجر: '+(e.message||e),true)}}

async function secureLogin(){
  const identity=document.getElementById('loginIdentity')?.value.trim()||'',password=document.getElementById('loginPassword')?.value||'',notice=document.getElementById('loginNotice'),button=document.getElementById('loginBtn');
  if(!identity||!password){if(notice)notice.textContent='أدخل اسم المستخدم/الهاتف وكلمة المرور.';return}if(button){button.disabled=true;button.textContent='جاري التحقق...'}
  try{const{data,error}=await runtime.sb.rpc('vendor_login_session',{p_identity:identity,p_password:password});if(error)throw error;if(!data?.store||!data?.session_token)throw new Error('لم تُنشأ جلسة متجر صالحة.');saveSession(data);runtime.setStore(data.store);runtime.saveStoreSession(data.store);await runtime.openDashboard();await loadSegmentOrders()}catch(e){console.error('Vendor secure login error',e);if(notice)notice.textContent=e.message||String(e)}finally{if(button){button.disabled=false;button.textContent='دخول إلى المتجر'}}
}

async function secureLogout(){const active=session();clearSession();if(active){try{await runtime.sb.rpc('vendor_logout_session',{p_session_token:active.token})}catch(e){console.warn('Vendor session revoke failed',e)}}return runtime.nativeVendorLogout()}

window.vendorLogin=secureLogin;window.vendorLogout=secureLogout;window.loadOrders=loadSegmentOrders;window.renderVendorOrders=renderOrders;window.openV94VendorOrderDetails=openDetails;window.setV94VendorStoreStatus=setStatus;window.MeshwarVendorV94={projectOrder:projectLegacyOrder,projectSegment,loadOrders:loadSegmentOrders,session};
setTimeout(()=>{if(runtime.getStore())loadSegmentOrders()},100);
})();
