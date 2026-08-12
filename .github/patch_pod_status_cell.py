from pathlib import Path

# Employee dashboard: use the page's existing hidden .modal class, show POD only in status cell for delivered orders.
p=Path('employee-dashboard.html')
s=p.read_text(encoding='utf-8')
s=s.replace('<div id="employeePodViewer" class="modal-overlay">','<div id="employeePodViewer" class="modal">')
old=""" function decorate(){const rows=[...document.querySelectorAll('#ordersTableBody tr, #employeeOrdersTableBody tr')].filter(x=>x.querySelectorAll('td').length>1);rows.forEach((tr,i)=>{const o=cloudOrders?.[i],u=podUrl(o);if(!o||!u||tr.dataset.podDecorated==='1')return;tr.dataset.podDecorated='1';const cells=tr.querySelectorAll('td'),action=cells[cells.length-1];if(action)action.insertAdjacentHTML('beforeend',' '+btn(o))})}\n const loadBase=loadPipelineOrders;loadPipelineOrders=async function(...a){const r=await loadBase(...a);decorate();return r};window.loadPipelineOrders=loadPipelineOrders;\n if(typeof openOrderDetailsModalData==='function'){const detailsBase=openOrderDetailsModalData;openOrderDetailsModalData=async function(id){await detailsBase(id);const raw=decodeURIComponent(id),o=cloudOrders.find(x=>String(x.id)===String(raw)),box=document.getElementById('modalOrderDetailsBody');if(box&&o&&podUrl(o)&&!box.querySelector('.pod-details-box'))box.insertAdjacentHTML('beforeend',`<div class=\"detail-box pod-details-box\" style=\"grid-column:1/-1\"><b>إثبات التسليم:</b><br>${btn(o)}</div>`)};window.openOrderDetailsModalData=openOrderDetailsModalData}\n Object.assign(window,{viewEmployeePod:view,closeEmployeePodViewer:close});"""
new=""" function decorate(){const rows=[...document.querySelectorAll('#pipelineOrdersBody tr')].filter(x=>x.querySelectorAll('td').length>1);rows.forEach((tr,i)=>{const o=cloudOrders?.[i],u=podUrl(o);if(!o||String(o.status||'').trim()!=='تم التسليم'||!u||tr.dataset.podDecorated==='1')return;tr.dataset.podDecorated='1';const cells=tr.querySelectorAll('td'),statusCell=cells[5];if(statusCell)statusCell.insertAdjacentHTML('beforeend','<br>'+btn(o))})}\n const loadBase=loadPipelineOrders;loadPipelineOrders=async function(...a){const r=await loadBase(...a);decorate();return r};window.loadPipelineOrders=loadPipelineOrders;\n Object.assign(window,{viewEmployeePod:view,closeEmployeePodViewer:close});"""
if old not in s:
    raise SystemExit('employee POD block not found')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')

# Admin dashboard: move POD button from action cell to status cell, delivered + real URL only; keep lightbox modal only.
p=Path('admin-dashboard.html')
s=p.read_text(encoding='utf-8')
old=""" function decorate(){[...document.querySelectorAll('#adminOrdersTableBody tr')].forEach((tr,i)=>{const o=adminOrdersCloud?.[i],u=podUrl(o);if(!o||!u||tr.dataset.podDecorated==='1')return;tr.dataset.podDecorated='1';const cells=tr.querySelectorAll('td'),action=cells[cells.length-1];if(action)action.insertAdjacentHTML('beforeend',' '+btn(o))})}\n const loadBase=loadAdminOrders;loadAdminOrders=async function(...a){const r=await loadBase(...a);decorate();return r};window.loadAdminOrders=loadAdminOrders;\n const detailsBase=openOrderDetailsModalData;openOrderDetailsModalData=async function(id){await detailsBase(id);const raw=decodeURIComponent(id),o=adminOrdersCloud.find(x=>String(x.id)===String(raw)),box=document.getElementById('modalOrderDetailsBody');if(box&&o&&podUrl(o)&&!box.querySelector('.pod-details-box'))box.insertAdjacentHTML('beforeend',`<div class=\"detail-box pod-details-box\" style=\"grid-column:1/-1\"><b>إثبات التسليم:</b><br>${btn(o)}</div>`)};\n Object.assign(window,{viewAdminPod:view,closeAdminPodViewer:close,openOrderDetailsModalData});"""
new=""" function decorate(){[...document.querySelectorAll('#adminOrdersTableBody tr')].forEach((tr,i)=>{const o=adminOrdersCloud?.[i],u=podUrl(o);if(!o||String(o.status||'').trim()!=='تم التسليم'||!u||tr.dataset.podDecorated==='1')return;tr.dataset.podDecorated='1';const cells=tr.querySelectorAll('td'),statusCell=cells[7];if(statusCell)statusCell.insertAdjacentHTML('beforeend','<br>'+btn(o))})}\n const loadBase=loadAdminOrders;loadAdminOrders=async function(...a){const r=await loadBase(...a);decorate();return r};window.loadAdminOrders=loadAdminOrders;\n Object.assign(window,{viewAdminPod:view,closeAdminPodViewer:close});"""
if old not in s:
    raise SystemExit('admin POD block not found')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')

print('POD status-cell fix applied')
