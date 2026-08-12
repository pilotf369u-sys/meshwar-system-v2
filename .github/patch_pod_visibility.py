from pathlib import Path

FILES=['admin-dashboard.html','employee-dashboard.html','branch-dashboard.html','dashboard.html']

def append_once(path, marker, block):
    p=Path(path); s=p.read_text(encoding='utf-8')
    if marker not in s:
        p.write_text(s+'\n'+block+'\n',encoding='utf-8')

admin=r'''<style>
.pod-view-btn{margin-top:6px;background:#0f766e;color:#fff;border:0;border-radius:7px;padding:6px 9px;font-weight:800;cursor:pointer}.pod-preview-full{max-width:100%;max-height:76vh;object-fit:contain;border-radius:10px;border:1px solid #cbd5e1}
</style>
<div id="adminPodViewer" class="modal-overlay"><div class="modal-content" style="max-width:900px;text-align:center"><button class="btn-red" onclick="closeAdminPodViewer()" style="float:left">×</button><h3>🖼️ إثبات التسليم</h3><img id="adminPodViewerImg" class="pod-preview-full" alt="صورة إثبات التسليم"></div></div>
<script>
/* POD_VISIBILITY_V1_ADMIN */
(function(){
 function detailsOf(o){if(!o?.details)return{};if(typeof o.details==='object')return o.details;try{return JSON.parse(o.details)}catch{return{}}}
 function podUrl(o){const d=detailsOf(o);return String(o?.delivery_proof_url||o?.pod_image_url||o?.proof_of_delivery_url||d.delivery_proof_url||d.proof_of_delivery_url||d.pod_image_url||'').trim()}
 function btn(o){const u=podUrl(o);return u?`<button class="pod-view-btn" type="button" onclick="viewAdminPod('${esc(u)}')">🖼️ عرض صورة إثبات التسليم</button>`:''}
 function view(u){if(!u)return;document.getElementById('adminPodViewerImg').src=u;document.getElementById('adminPodViewer').style.display='flex'}
 function close(){document.getElementById('adminPodViewer').style.display='none';document.getElementById('adminPodViewerImg').src=''}
 function decorate(){[...document.querySelectorAll('#adminOrdersTableBody tr')].forEach((tr,i)=>{const o=adminOrdersCloud?.[i],u=podUrl(o);if(!o||!u||tr.dataset.podDecorated==='1')return;tr.dataset.podDecorated='1';const cells=tr.querySelectorAll('td'),action=cells[cells.length-1];if(action)action.insertAdjacentHTML('beforeend',' '+btn(o))})}
 const loadBase=loadAdminOrders;loadAdminOrders=async function(...a){const r=await loadBase(...a);decorate();return r};window.loadAdminOrders=loadAdminOrders;
 const detailsBase=openOrderDetailsModalData;openOrderDetailsModalData=async function(id){await detailsBase(id);const raw=decodeURIComponent(id),o=adminOrdersCloud.find(x=>String(x.id)===String(raw)),box=document.getElementById('modalOrderDetailsBody');if(box&&o&&podUrl(o)&&!box.querySelector('.pod-details-box'))box.insertAdjacentHTML('beforeend',`<div class="detail-box pod-details-box" style="grid-column:1/-1"><b>إثبات التسليم:</b><br>${btn(o)}</div>`)};
 Object.assign(window,{viewAdminPod:view,closeAdminPodViewer:close,openOrderDetailsModalData});
})();
</script>'''
append_once('admin-dashboard.html','POD_VISIBILITY_V1_ADMIN',admin)

employee=r'''<style>
.pod-view-btn{margin-top:6px;background:#0f766e;color:#fff;border:0;border-radius:7px;padding:6px 9px;font-weight:800;cursor:pointer}.pod-preview-full{max-width:100%;max-height:76vh;object-fit:contain;border-radius:10px;border:1px solid #cbd5e1}
</style>
<div id="employeePodViewer" class="modal-overlay"><div class="modal-content" style="max-width:900px;text-align:center"><button class="btn btn-red" onclick="closeEmployeePodViewer()" style="float:left">×</button><h3>🖼️ إثبات التسليم</h3><img id="employeePodViewerImg" class="pod-preview-full" alt="صورة إثبات التسليم"></div></div>
<script>
/* POD_VISIBILITY_V1_EMPLOYEE */
(function(){
 function podUrl(o){const d=parseDetails(o?.details);return String(o?.delivery_proof_url||o?.pod_image_url||o?.proof_of_delivery_url||d.delivery_proof_url||d.proof_of_delivery_url||d.pod_image_url||'').trim()}
 function btn(o){const u=podUrl(o);return u?`<button class="pod-view-btn" type="button" onclick="viewEmployeePod('${escapeHtml(u)}')">🖼️ عرض صورة إثبات التسليم</button>`:''}
 function view(u){if(!u)return;document.getElementById('employeePodViewerImg').src=u;document.getElementById('employeePodViewer').style.display='flex'}
 function close(){document.getElementById('employeePodViewer').style.display='none';document.getElementById('employeePodViewerImg').src=''}
 function decorate(){const rows=[...document.querySelectorAll('#ordersTableBody tr, #employeeOrdersTableBody tr')].filter(x=>x.querySelectorAll('td').length>1);rows.forEach((tr,i)=>{const o=cloudOrders?.[i],u=podUrl(o);if(!o||!u||tr.dataset.podDecorated==='1')return;tr.dataset.podDecorated='1';const cells=tr.querySelectorAll('td'),action=cells[cells.length-1];if(action)action.insertAdjacentHTML('beforeend',' '+btn(o))})}
 const loadBase=loadPipelineOrders;loadPipelineOrders=async function(...a){const r=await loadBase(...a);decorate();return r};window.loadPipelineOrders=loadPipelineOrders;
 if(typeof openOrderDetailsModalData==='function'){const detailsBase=openOrderDetailsModalData;openOrderDetailsModalData=async function(id){await detailsBase(id);const raw=decodeURIComponent(id),o=cloudOrders.find(x=>String(x.id)===String(raw)),box=document.getElementById('modalOrderDetailsBody');if(box&&o&&podUrl(o)&&!box.querySelector('.pod-details-box'))box.insertAdjacentHTML('beforeend',`<div class="detail-box pod-details-box" style="grid-column:1/-1"><b>إثبات التسليم:</b><br>${btn(o)}</div>`)};window.openOrderDetailsModalData=openOrderDetailsModalData}
 Object.assign(window,{viewEmployeePod:view,closeEmployeePodViewer:close});
})();
</script>'''
append_once('employee-dashboard.html','POD_VISIBILITY_V1_EMPLOYEE',employee)

branch=r'''<style>
.pod-view-btn{margin-top:6px;background:#0f766e;color:#fff;border:0;border-radius:7px;padding:6px 9px;font-weight:800;cursor:pointer}.pod-preview-full{max-width:100%;max-height:76vh;object-fit:contain;border-radius:10px;border:1px solid #cbd5e1}
</style>
<div id="branchPodViewer" class="modal"><div class="modal-content" style="max-width:900px;text-align:center"><span class="close" onclick="closeBranchPodViewer()">&times;</span><h3>🖼️ إثبات التسليم</h3><img id="branchPodViewerImg" class="pod-preview-full" alt="صورة إثبات التسليم"></div></div>
<script>
/* POD_VISIBILITY_V1_BRANCH */
(function(){
 function podUrl(o){const d=parseDetails(o?.details);return String(o?.delivery_proof_url||o?.pod_image_url||o?.proof_of_delivery_url||d.delivery_proof_url||d.proof_of_delivery_url||d.pod_image_url||'').trim()}
 function btn(o){const u=podUrl(o);return u?`<button class="pod-view-btn" type="button" onclick="viewBranchPod('${esc(u)}')">🖼️ عرض صورة إثبات التسليم</button>`:''}
 function view(u){if(!u)return;document.getElementById('branchPodViewerImg').src=u;document.getElementById('branchPodViewer').style.display='block'}
 function close(){document.getElementById('branchPodViewer').style.display='none';document.getElementById('branchPodViewerImg').src=''}
 function decorate(){const rows=[...document.querySelectorAll('#ordersBody tr')].filter(x=>x.querySelectorAll('td').length>1);rows.forEach((tr,i)=>{const o=orders?.[i],u=podUrl(o);if(!o||!u||tr.dataset.podDecorated==='1')return;tr.dataset.podDecorated='1';const cells=tr.querySelectorAll('td'),cell=cells[6]||cells[cells.length-1];if(cell)cell.insertAdjacentHTML('beforeend','<br>'+btn(o))})}
 const loadBase=loadOrders;loadOrders=async function(...a){const r=await loadBase(...a);decorate();return r};window.loadOrders=loadOrders;
 Object.assign(window,{viewBranchPod:view,closeBranchPodViewer:close});
})();
</script>'''
append_once('branch-dashboard.html','POD_VISIBILITY_V1_BRANCH',branch)

customer=r'''<style>
.customer-pod-btn{margin-top:7px;background:#0f766e;color:#fff;border:0;border-radius:9px;padding:8px 11px;font-weight:800;cursor:pointer}.customer-pod-full{max-width:100%;max-height:76vh;object-fit:contain;border-radius:10px;border:1px solid #cbd5e1}
</style>
<div id="customerPodViewer" class="modal-overlay"><div class="modal-content" style="max-width:900px;text-align:center"><button class="btn-cancel" onclick="closeCustomerPodViewer()" style="float:left">×</button><h3>🖼️ إثبات التسليم</h3><img id="customerPodViewerImg" class="customer-pod-full" alt="صورة إثبات التسليم"></div></div>
<script>
/* POD_VISIBILITY_V1_CUSTOMER */
(function(){
 function podUrl(o){const d=parseOrderDetails(o?.details);return String(o?.delivery_proof_url||o?.pod_image_url||o?.proof_of_delivery_url||d.delivery_proof_url||d.proof_of_delivery_url||d.pod_image_url||'').trim()}
 function btn(o){const u=podUrl(o);return u?`<button class="customer-pod-btn" type="button" onclick="viewCustomerPod('${escapeHtml(u)}')">🖼️ عرض صورة إثبات التسليم</button>`:''}
 function view(u){if(!u)return;document.getElementById('customerPodViewerImg').src=u;document.getElementById('customerPodViewer').style.display='flex'}
 function close(){document.getElementById('customerPodViewer').style.display='none';document.getElementById('customerPodViewerImg').src=''}
 function decorate(){const hist=currentCustomerOrdersGlobal.filter(o=>isHistoryStatus(o.status)),rows=[...document.querySelectorAll('#historyOrdersTableBody tr')].filter(x=>x.querySelectorAll('td').length>1);rows.forEach((tr,i)=>{const o=hist[i],u=podUrl(o);if(!o||!u||tr.dataset.podDecorated==='1')return;tr.dataset.podDecorated='1';const cells=tr.querySelectorAll('td'),cell=cells[cells.length-1];if(cell)cell.insertAdjacentHTML('beforeend','<br>'+btn(o))})}
 const renderBase=renderOrdersPanels;renderOrdersPanels=function(...a){const r=renderBase(...a);decorate();return r};window.renderOrdersPanels=renderOrdersPanels;
 const detailsBase=openCustomerOrderDetails;openCustomerOrderDetails=function(i){detailsBase(i);const o=currentCustomerOrdersGlobal[i],box=document.getElementById('customerOrderDetailsContent');if(box&&o&&podUrl(o)&&!box.querySelector('.customer-pod-box'))box.insertAdjacentHTML('beforeend',`<div class="customer-pod-box" style="margin-top:14px;padding:10px;border:1px solid #e5eaf1;border-radius:10px"><b>إثبات التسليم:</b><br>${btn(o)}</div>`)};window.openCustomerOrderDetails=openCustomerOrderDetails;
 Object.assign(window,{viewCustomerPod:view,closeCustomerPodViewer:close});
})();
</script>'''
append_once('dashboard.html','POD_VISIBILITY_V1_CUSTOMER',customer)

print('POD visibility patch applied to', ', '.join(FILES))
