from pathlib import Path
p=Path('employee-dashboard.html')
s=p.read_text(encoding='utf-8')
old="async function setupRealtime(){const sb=await ensureEmployeeSupabase();realtimeChannel=sb.channel('employee-orders-pipeline').on('postgres_changes',{event:'*',schema:'public',table:'orders'},async()=>{await Promise.all([refreshPipelineCounts(),PIPELINES[activePipeline].rewards?loadRewardsManagementTable():loadPipelineOrders()])}).subscribe();unreadRealtimeChannel=sb.channel('employee-messages-pipeline').on('postgres_changes',{event:'*',schema:'public',table:'messages'},async payload=>{if(currentChatCustomerId&&cloudId(payload?.new?.customer_id||payload?.old?.customer_id)===currentChatCustomerId)await loadChatMessages();await fetchUnreadChatNotifications()}).subscribe();unreadPollingTimer=setInterval(fetchUnreadChatNotifications,10000)}"
new=r'''/* EMPLOYEE_SAFE_REALTIME_V42 — targeted rows only; never reload page/table from realtime */
let employeeRealtimePending=new Map(),employeeRealtimeFlushTimer=null,employeeRealtimeLastEditAt=0;
function employeeRealtimeIsEditing(){const a=document.activeElement,p=document.getElementById('ordersPanel');return !!(a&&p&&p.contains(a)&&/^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName))}
function employeeRealtimeTouchEdit(){employeeRealtimeLastEditAt=Date.now()}
function employeeRealtimeViewMatch(o){
  const p=PIPELINES[activePipeline];if(!p||p.rewards)return false;
  const term=normalizeSearch(document.getElementById('employeeOrderSearch')?.value||'');
  if(term){const hay=[o.order_code,o.reference_order_no,o.customer_name,o.customer_phone].map(v=>String(v||'').toLowerCase()).join(' ');return hay.includes(String(term||'').toLowerCase())}
  if(!(p.statuses||[]).includes(o.status))return false;
  if(p.branch){
    if(!(cloudId(o.branch_id)||String(o.branch_name||'').trim()))return false;
    const branch=cloudId(document.getElementById('branchFilter')?.value);if(branch&&cloudId(o.branch_id)!==branch)return false;
  }
  return true;
}
function employeeRealtimeFindRow(id){const enc=encodeURIComponent(cloudId(id));return document.getElementById('status-'+enc)?.closest('tr')||document.getElementById('price-'+enc)?.closest('tr')||null}
async function employeeRealtimeApply(payload){
  const raw=payload?.new&&Object.keys(payload.new).length?payload.new:payload?.old||{},id=cloudId(raw.id);if(!id)return;
  const idx=cloudOrders.findIndex(x=>cloudId(x.id)===id),row=employeeRealtimeFindRow(id);
  if(payload.eventType==='DELETE'){
    if(idx>=0)cloudOrders.splice(idx,1);if(row)row.remove();pipelineTotal=Math.max(0,pipelineTotal-1);renderPagination();await refreshPipelineCounts();return;
  }
  const next=normalizeOrderMetrics({...raw});await enrichCustomerCodes([next]);const visible=employeeRealtimeViewMatch(next);
  if(!visible){if(idx>=0)cloudOrders.splice(idx,1);if(row)row.remove();renderPagination();await refreshPipelineCounts();return}
  if(idx>=0)cloudOrders[idx]=next;else cloudOrders.unshift(next);
  const html=orderRowHtml(next);
  if(row)row.outerHTML=html;
  else if(pipelinePage===1){const body=document.getElementById('pipelineOrdersBody');if(body){if(body.querySelector('td[colspan]'))body.innerHTML='';body.insertAdjacentHTML('afterbegin',html);while(body.querySelectorAll('tr').length>pipelinePageSize)body.lastElementChild?.remove()}pipelineTotal+=1}
  renderPagination();await Promise.all([renderBarcodes(),refreshPipelineCounts()]);
}
function employeeRealtimeQueue(payload){
  const id=cloudId(payload?.new?.id||payload?.old?.id);if(!id)return;employeeRealtimePending.set(id,payload);clearTimeout(employeeRealtimeFlushTimer);
  const flush=async()=>{if(employeeRealtimeIsEditing()||Date.now()-employeeRealtimeLastEditAt<900){employeeRealtimeFlushTimer=setTimeout(flush,1000);return}const batch=[...employeeRealtimePending.values()];employeeRealtimePending.clear();for(const x of batch)await employeeRealtimeApply(x)};
  employeeRealtimeFlushTimer=setTimeout(flush,employeeRealtimeIsEditing()?60000:220);
}
async function setupRealtime(){
  const panel=document.getElementById('ordersPanel');if(panel&&!panel.dataset.safeRealtimeV42){panel.dataset.safeRealtimeV42='1';panel.addEventListener('input',employeeRealtimeTouchEdit,true);panel.addEventListener('change',employeeRealtimeTouchEdit,true);panel.addEventListener('focusout',()=>{employeeRealtimeLastEditAt=Date.now();clearTimeout(employeeRealtimeFlushTimer);employeeRealtimeFlushTimer=setTimeout(async()=>{if(employeeRealtimeIsEditing())return;const batch=[...employeeRealtimePending.values()];employeeRealtimePending.clear();for(const x of batch)await employeeRealtimeApply(x)},1000)},true)}
  const sb=await ensureEmployeeSupabase();
  realtimeChannel=sb.channel('employee-orders-pipeline-v42').on('postgres_changes',{event:'*',schema:'public',table:'orders'},payload=>employeeRealtimeQueue(payload)).subscribe();
  unreadRealtimeChannel=sb.channel('employee-messages-pipeline').on('postgres_changes',{event:'*',schema:'public',table:'messages'},async payload=>{if(currentChatCustomerId&&cloudId(payload?.new?.customer_id||payload?.old?.customer_id)===currentChatCustomerId)await loadChatMessages();await fetchUnreadChatNotifications()}).subscribe();
  unreadPollingTimer=setInterval(fetchUnreadChatNotifications,10000)
}'''
if old not in s:
    raise SystemExit('setupRealtime baseline not found; aborting safely')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
