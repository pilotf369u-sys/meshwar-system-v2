from pathlib import Path
p=Path('employee-dashboard.html')
s=p.read_text(encoding='utf-8')
new=r'''/* EMPLOYEE_SAFE_REALTIME_V42 — targeted rows only; never reload page/table from realtime */
let employeeRealtimePending=new Map(),employeeRealtimeFlushTimer=null;
function employeeRealtimeIsEditing(){const a=document.activeElement,p=document.getElementById('ordersPanel');return !!(a&&p&&p.contains(a)&&/^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName))}
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
  const raw=payload?.new&&Object.keys(payload.new).length?payload.new:payload?.old||{},id=cloudId(raw.id);if(!id)return false;
  const idx=cloudOrders.findIndex(x=>cloudId(x.id)===id),row=employeeRealtimeFindRow(id),wasPresent=idx>=0||!!row;
  if(payload.eventType==='DELETE'){
    if(idx>=0)cloudOrders.splice(idx,1);if(row)row.remove();if(wasPresent)pipelineTotal=Math.max(0,pipelineTotal-1);renderPagination();return true;
  }
  const next=normalizeOrderMetrics({...raw});await enrichCustomerCodes([next]);const visible=employeeRealtimeViewMatch(next);
  if(!visible){if(idx>=0)cloudOrders.splice(idx,1);if(row)row.remove();if(wasPresent)pipelineTotal=Math.max(0,pipelineTotal-1);renderPagination();return true}
  if(idx>=0)cloudOrders[idx]=next;else cloudOrders.unshift(next);
  const html=orderRowHtml(next);
  if(row)row.outerHTML=html;
  else {
    if(!wasPresent)pipelineTotal+=1;
    if(pipelinePage===1){const body=document.getElementById('pipelineOrdersBody');if(body){if(body.querySelector('td[colspan]'))body.innerHTML='';body.insertAdjacentHTML('afterbegin',html);while(body.querySelectorAll('tr').length>pipelinePageSize)body.lastElementChild?.remove()}}
  }
  renderPagination();return true;
}
async function employeeRealtimeFlush(){
  if(employeeRealtimeIsEditing()){employeeRealtimeFlushTimer=setTimeout(employeeRealtimeFlush,1000);return}
  const batch=[...employeeRealtimePending.values()];employeeRealtimePending.clear();let changed=false;
  for(const x of batch)changed=(await employeeRealtimeApply(x))||changed;
  if(changed)await Promise.all([renderBarcodes(),refreshPipelineCounts()]);
}
function employeeRealtimeQueue(payload){
  const id=cloudId(payload?.new?.id||payload?.old?.id);if(!id)return;employeeRealtimePending.set(id,payload);clearTimeout(employeeRealtimeFlushTimer);
  employeeRealtimeFlushTimer=setTimeout(employeeRealtimeFlush,employeeRealtimeIsEditing()?60000:220);
}
async function setupRealtime(){
  const panel=document.getElementById('ordersPanel');if(panel&&!panel.dataset.safeRealtimeV42){panel.dataset.safeRealtimeV42='1';panel.addEventListener('focusout',()=>{clearTimeout(employeeRealtimeFlushTimer);employeeRealtimeFlushTimer=setTimeout(employeeRealtimeFlush,800)},true)}
  const sb=await ensureEmployeeSupabase();
  realtimeChannel=sb.channel('employee-orders-pipeline-v42').on('postgres_changes',{event:'*',schema:'public',table:'orders'},payload=>employeeRealtimeQueue(payload)).subscribe();
  unreadRealtimeChannel=sb.channel('employee-messages-pipeline').on('postgres_changes',{event:'*',schema:'public',table:'messages'},async payload=>{if(currentChatCustomerId&&cloudId(payload?.new?.customer_id||payload?.old?.customer_id)===currentChatCustomerId)await loadChatMessages();await fetchUnreadChatNotifications()}).subscribe();
  unreadPollingTimer=setInterval(fetchUnreadChatNotifications,10000)
}'''
marker='/* EMPLOYEE_SAFE_REALTIME_V42'
start=s.find(marker)
end=s.find("document.addEventListener('click'",start)
if start<0 or end<0 or end<=start:
    raise SystemExit(f'V42 markers not found start={start} end={end}')
s=s[:start]+new+'\n'+s[end:]
if s.count('EMPLOYEE_SAFE_REALTIME_V42')!=1:raise SystemExit('V42 dedupe failed')
if s.count("let employeeRealtimePending=")!=1:raise SystemExit('V42 declaration dedupe failed')
p.write_text(s,encoding='utf-8')
