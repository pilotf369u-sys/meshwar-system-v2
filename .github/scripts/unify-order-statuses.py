from pathlib import Path

files=['employee-dashboard.html','admin-dashboard.html','branch-dashboard.html']

common = r'''
<script>
/* UNIFIED_ORDER_STATUS_DROPDOWN_V1 */
(function(){
  const statuses=[
    'مستحق مكافأة',
    'ملغية من قبل العميل',
    'بانتظار رد الموظف',
    'بانتظار موافقة العميل',
    'بانتظار تأكيد الدفع',
    'تم التسديد',
    'قيد الطلب',
    'مخزن الشركة',
    'تجهيز شحن',
    'محولة إلى الفرع',
    'تم الشحن',
    'مخزن محلي',
    'مندوب',
    'توزيع داخلي',
    'تم التسليم',
    'رفض التسليم',
    'مرفوض'
  ];
  const legacyMap={
    'انتظار رد الموظف':'بانتظار رد الموظف',
    'بانتظار موافقة الزبون':'بانتظار موافقة العميل',
    'بانتظار التسعير':'بانتظار موافقة العميل',
    'تم التسعير / بانتظار موافقة العميل':'بانتظار موافقة العميل',
    'تمت الموافقة - بانتظار الدفع':'بانتظار تأكيد الدفع',
    'تمت الموافقة':'بانتظار تأكيد الدفع',
    'مخزن شركة':'مخزن الشركة',
    'جاري التوصيل مع المندوب':'مندوب',
    'رفض الطلب':'رفض التسليم'
  };
  window.MESHWAR_UNIFIED_ORDER_STATUSES=statuses.slice();
  window.normalizeMeshwarOrderStatus=function(value){const v=String(value||'').trim();return legacyMap[v]||v};
  window.buildUnifiedOrderStatusOptions=function(current){
    const selected=window.normalizeMeshwarOrderStatus(current);
    const escapeValue=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
    return statuses.map(s=>`<option value="${escapeValue(s)}" ${s===selected?'selected':''}>${escapeValue(s)}</option>`).join('');
  };
  try{statusOptions=function(current){return window.buildUnifiedOrderStatusOptions(current)}}catch(_){window.statusOptions=function(current){return window.buildUnifiedOrderStatusOptions(current)}}
})();
</script>
'''

employee = common + r'''
<script>
/* UNIFIED_ORDER_STATUS_DROPDOWN_V1_EMPLOYEE */
(function(){
  const originalSave=saveOrderRow;
  saveOrderRow=async function(encodedId){
    const statusEl=document.getElementById('status-'+encodedId);
    if(statusEl)statusEl.value=window.normalizeMeshwarOrderStatus(statusEl.value);
    if(statusEl?.value==='محولة إلى الفرع'){
      const branchId=String(document.getElementById('branch-'+encodedId)?.value||'').trim();
      if(!branchId){alert('اختر الفرع أولاً قبل تحويل الطلب إلى الفرع.');return;}
    }
    const result=await originalSave(encodedId);
    try{await refreshPipelineCounts()}catch(e){console.warn('Pipeline count refresh warning:',e)}
    return result;
  };
  if(typeof PIPELINES==='object'){
    if(PIPELINES.waiting_employee)PIPELINES.waiting_employee.statuses=['بانتظار رد الموظف','انتظار رد الموظف'];
    if(PIPELINES.waiting_customer)PIPELINES.waiting_customer.statuses=['بانتظار موافقة العميل','بانتظار موافقة الزبون','بانتظار التسعير','تم التسعير / بانتظار موافقة العميل'];
    if(PIPELINES.waiting_payment)PIPELINES.waiting_payment.statuses=['بانتظار تأكيد الدفع','تمت الموافقة - بانتظار الدفع','تمت الموافقة'];
    if(PIPELINES.in_order)PIPELINES.in_order.statuses=['قيد الطلب'];
    if(PIPELINES.company_store)PIPELINES.company_store.statuses=['مخزن الشركة','مخزن شركة'];
    if(PIPELINES.preparing)PIPELINES.preparing.statuses=['تجهيز شحن'];
    if(PIPELINES.shipped)PIPELINES.shipped.statuses=['تم الشحن'];
    if(PIPELINES.local_store)PIPELINES.local_store.statuses=['مخزن محلي'];
    if(PIPELINES.courier)PIPELINES.courier.statuses=['مندوب','جاري التوصيل مع المندوب'];
    if(PIPELINES.internal)PIPELINES.internal.statuses=['توزيع داخلي'];
    if(PIPELINES.delivered)PIPELINES.delivered.statuses=['تم التسليم'];
    if(PIPELINES.rejected_delivery)PIPELINES.rejected_delivery.statuses=['رفض التسليم','رفض الطلب'];
    if(PIPELINES.rejected)PIPELINES.rejected.statuses=['مرفوض'];
  }
  Object.assign(window,{saveOrderRow});
})();
</script>
'''

admin = common + r'''
<script>
/* UNIFIED_ORDER_STATUS_DROPDOWN_V1_ADMIN */
(function(){
  const originalSave=typeof saveAdminOrderRow==='function'?saveAdminOrderRow:(typeof saveOrderRow==='function'?saveOrderRow:null);
  if(originalSave){
    const wrapped=async function(encodedId){
      const statusEl=document.getElementById('admin-status-'+encodedId)||document.getElementById('status-'+encodedId);
      if(statusEl)statusEl.value=window.normalizeMeshwarOrderStatus(statusEl.value);
      if(statusEl?.value==='محولة إلى الفرع'){
        const branchEl=document.getElementById('admin-branch-'+encodedId)||document.getElementById('branch-'+encodedId);
        if(!String(branchEl?.value||'').trim()){alert('اختر الفرع أولاً قبل تحويل الطلب إلى الفرع.');return;}
      }
      const result=await originalSave(encodedId);
      try{await refreshAdminPipelineCounts()}catch(e){console.warn('Admin pipeline count refresh warning:',e)}
      return result;
    };
    if(typeof saveAdminOrderRow==='function'){saveAdminOrderRow=wrapped;window.saveAdminOrderRow=wrapped}else{saveOrderRow=wrapped;window.saveOrderRow=wrapped}
  }
  if(typeof ADMIN_PIPELINES==='object'){
    if(ADMIN_PIPELINES.waiting_employee)ADMIN_PIPELINES.waiting_employee.statuses=['بانتظار رد الموظف','انتظار رد الموظف'];
    if(ADMIN_PIPELINES.waiting_customer)ADMIN_PIPELINES.waiting_customer.statuses=['بانتظار موافقة العميل','بانتظار موافقة الزبون','بانتظار التسعير','تم التسعير / بانتظار موافقة العميل'];
    if(ADMIN_PIPELINES.waiting_payment)ADMIN_PIPELINES.waiting_payment.statuses=['بانتظار تأكيد الدفع','تمت الموافقة - بانتظار الدفع','تمت الموافقة'];
    if(ADMIN_PIPELINES.in_order)ADMIN_PIPELINES.in_order.statuses=['قيد الطلب'];
    if(ADMIN_PIPELINES.company_store)ADMIN_PIPELINES.company_store.statuses=['مخزن الشركة','مخزن شركة'];
    if(ADMIN_PIPELINES.preparing)ADMIN_PIPELINES.preparing.statuses=['تجهيز شحن'];
    if(ADMIN_PIPELINES.shipped)ADMIN_PIPELINES.shipped.statuses=['تم الشحن'];
    if(ADMIN_PIPELINES.local_store)ADMIN_PIPELINES.local_store.statuses=['مخزن محلي'];
    if(ADMIN_PIPELINES.courier)ADMIN_PIPELINES.courier.statuses=['مندوب','جاري التوصيل مع المندوب'];
    if(ADMIN_PIPELINES.internal)ADMIN_PIPELINES.internal.statuses=['توزيع داخلي'];
    if(ADMIN_PIPELINES.delivered)ADMIN_PIPELINES.delivered.statuses=['تم التسليم'];
    if(ADMIN_PIPELINES.rejected_delivery)ADMIN_PIPELINES.rejected_delivery.statuses=['رفض التسليم','رفض الطلب'];
    if(ADMIN_PIPELINES.rejected)ADMIN_PIPELINES.rejected.statuses=['مرفوض'];
  }
})();
</script>
'''

branch = common + r'''
<script>
/* UNIFIED_ORDER_STATUS_DROPDOWN_V1_BRANCH */
(function(){
  const refillFilter=()=>{
    const filter=document.getElementById('statusFilter');if(!filter)return;
    const current=window.normalizeMeshwarOrderStatus(filter.value);
    filter.innerHTML='<option value="">كل الحالات</option>'+window.MESHWAR_UNIFIED_ORDER_STATUSES.map(s=>`<option value="${s}" ${s===current?'selected':''}>${s}</option>`).join('');
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refillFilter);else refillFilter();
})();
</script>
'''

for f in files:
    p=Path(f)
    txt=p.read_text(encoding='utf-8')
    if 'UNIFIED_ORDER_STATUS_DROPDOWN_V1' in txt:
        continue
    addition = employee if f=='employee-dashboard.html' else admin if f=='admin-dashboard.html' else branch
    p.write_text(txt+'\n\n'+addition+'\n',encoding='utf-8')
