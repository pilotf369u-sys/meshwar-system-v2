from pathlib import Path
import re

REJECTS="['رفض التسليم','رفض الطلب','مرفوض','راجع']"

# Admin + employee: fix every late rejected pipeline override and the V2 definitions.
for fn,obj in [('admin-dashboard.html','ADMIN_PIPELINES'),('employee-dashboard.html','PIPELINES')]:
    p=Path(fn); s=p.read_text(encoding='utf-8')
    s=s.replace("rejected:{label:'❌ رفض التسليم',statuses:['رفض الطلب','مرفوض']}",f"rejected:{{label:'❌ رفض التسليم',statuses:{REJECTS}}}")
    s=s.replace("rejected:{label:'❌ رفض / مرفوض',statuses:['رفض الطلب','مرفوض']}",f"rejected:{{label:'❌ رفض / مرفوض',statuses:{REJECTS}}}")
    s=re.sub(rf"if\({obj}\.rejected\){obj}\.rejected\.statuses=\[[^\]]*\];",f"if({obj}.rejected){obj}.rejected.statuses={REJECTS};",s)
    p.write_text(s,encoding='utf-8')

admin=Path('admin-dashboard.html'); s=admin.read_text(encoding='utf-8')
if 'REJECTION_REASON_BADGE_V1_ADMIN' not in s:
    s += r'''
<style>
.rejection-reason-badge{margin-top:7px;padding:6px 8px;border-radius:7px;background:#fee2e2;color:#991b1b;border:1px solid #fecaca;font-size:11px;font-weight:800;white-space:normal;text-align:right;max-width:260px}
</style>
<script>
/* REJECTION_REASON_BADGE_V1_ADMIN */
(function(){
  const rejectedStatuses=new Set(['رفض التسليم','رفض الطلب','مرفوض','راجع']);
  function reasonOf(o){
    let d={};try{d=typeof o?.details==='object'?(o.details||{}):JSON.parse(o?.details||'{}')}catch{d={notes:String(o?.details||'')}}
    return String(o?.rejection_reason||d.delivery_rejection_reason||d.rejection_reason||d.reject_reason||o?.notes||d.delivery_note||d.notes||'').trim();
  }
  function decorate(){
    const rows=[...document.querySelectorAll('#adminOrdersTableBody tr')];
    rows.forEach((tr,i)=>{const o=adminOrdersCloud?.[i];if(!o||!rejectedStatuses.has(String(o.status||'').trim()))return;const cells=tr.querySelectorAll('td'),cell=cells[7];if(!cell||cell.querySelector('.rejection-reason-badge'))return;const reason=reasonOf(o);if(reason)cell.insertAdjacentHTML('beforeend',`<div class="rejection-reason-badge">سبب الرفض: ${esc(reason)}</div>`);});
  }
  const base=loadAdminOrders;loadAdminOrders=async function(...args){const r=await base(...args);decorate();return r};window.loadAdminOrders=loadAdminOrders;
})();
</script>
'''
    admin.write_text(s,encoding='utf-8')

emp=Path('employee-dashboard.html'); s=emp.read_text(encoding='utf-8')
if 'REJECTION_REASON_BADGE_V1_EMPLOYEE' not in s:
    s += r'''
<style>
.rejection-reason-badge{margin-top:7px;padding:6px 8px;border-radius:7px;background:#fee2e2;color:#991b1b;border:1px solid #fecaca;font-size:11px;font-weight:800;white-space:normal;text-align:right;max-width:260px}
</style>
<script>
/* REJECTION_REASON_BADGE_V1_EMPLOYEE */
(function(){
  const rejectedStatuses=new Set(['رفض التسليم','رفض الطلب','مرفوض','راجع']);
  function reasonOf(o){const d=parseDetails(o?.details);return String(o?.rejection_reason||d.delivery_rejection_reason||d.rejection_reason||d.reject_reason||o?.notes||d.delivery_note||d.notes||'').trim();}
  function decorate(){
    const rows=[...document.querySelectorAll('#ordersPanel tbody tr, #ordersTableBody tr, #employeeOrdersTableBody tr')].filter(tr=>tr.querySelectorAll('td').length>1);
    rows.forEach((tr,i)=>{const o=cloudOrders?.[i];if(!o||!rejectedStatuses.has(String(o.status||'').trim()))return;const cells=tr.querySelectorAll('td');let cell=[...cells].find(td=>td.querySelector(`select[id^="status-"]`))||cells[7]||cells[6];if(!cell||cell.querySelector('.rejection-reason-badge'))return;const reason=reasonOf(o);if(reason)cell.insertAdjacentHTML('beforeend',`<div class="rejection-reason-badge">سبب الرفض: ${escapeHtml(reason)}</div>`);});
  }
  const base=loadPipelineOrders;loadPipelineOrders=async function(...args){const r=await base(...args);decorate();return r};window.loadPipelineOrders=loadPipelineOrders;
})();
</script>
'''
    emp.write_text(s,encoding='utf-8')

branch=Path('branch-dashboard.html'); s=branch.read_text(encoding='utf-8')
if 'REJECTION_REASON_BADGE_V1_BRANCH' not in s:
    s += r'''
<style>
.branch-rejection-reason{margin-top:6px;padding:5px 7px;border-radius:7px;background:#fee2e2;color:#991b1b;border:1px solid #fecaca;font-size:11px;font-weight:800;white-space:normal;text-align:right}
</style>
<script>
/* REJECTION_REASON_BADGE_V1_BRANCH */
(function(){
  const rejectedStatuses=new Set(['رفض التسليم','رفض الطلب','مرفوض','راجع']);
  function reasonOf(o){const d=parseDetails(o?.details);return String(o?.rejection_reason||d.delivery_rejection_reason||d.rejection_reason||d.reject_reason||o?.notes||d.delivery_note||d.notes||'').trim();}
  function decorate(){
    const rows=[...document.querySelectorAll('#ordersBody tr')].filter(tr=>tr.querySelectorAll('td').length>1);
    rows.forEach((tr,i)=>{const o=orders?.[i];if(!o||!rejectedStatuses.has(String(o.status||'').trim()))return;const cells=tr.querySelectorAll('td'),cell=cells[6];if(!cell||cell.querySelector('.branch-rejection-reason'))return;const reason=reasonOf(o);if(reason)cell.insertAdjacentHTML('beforeend',`<div class="branch-rejection-reason">سبب الرفض: ${esc(reason)}</div>`);});
  }
  const base=loadOrders;loadOrders=async function(...args){const r=await base(...args);decorate();return r};window.loadOrders=loadOrders;
})();
</script>
'''
    branch.write_text(s,encoding='utf-8')

print('rejection visibility patch applied')
# trigger
