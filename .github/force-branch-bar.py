from pathlib import Path

EMP='employee-dashboard.html'
ADM='admin-dashboard.html'

emp=Path(EMP).read_text(encoding='utf-8')
adm=Path(ADM).read_text(encoding='utf-8')

emp_block=r'''

<style>
/* BRANCH_EXPORT_BAR_FORCE_V2 */
#branchTools.branch-manifest-visible{display:flex!important;visibility:visible!important;opacity:1!important;background:#f1f5f9!important;border:1px solid #cbd5e1!important;box-shadow:inset 0 1px 0 #fff!important;}
</style>
<script>
/* BRANCH_EXPORT_BAR_FORCE_V2 */
function syncEmployeeBranchManifestBar(){
  const bar=document.getElementById('branchTools');
  if(!bar)return;
  const visible=activePipeline==='branch_transfer';
  bar.classList.toggle('show',visible);
  bar.classList.toggle('branch-manifest-visible',visible);
  bar.hidden=false;
  bar.style.display=visible?'flex':'none';
}
switchPipeline=async function(key){
  if(!PIPELINES[key])return;
  activePipeline=key;
  pipelinePage=1;
  setActivePipelineButton(key);
  const p=PIPELINES[key];
  document.getElementById('activePipelineLabel').innerText=p.label;
  const reward=!!p.rewards;
  document.getElementById('ordersPanel').classList.toggle('hidden',reward);
  document.getElementById('rewardPanel').classList.toggle('show',reward);
  syncEmployeeBranchManifestBar();
  if(reward)await loadRewardsManagementTable();
  else await loadPipelineOrders();
  syncEmployeeBranchManifestBar();
};
buildPipelineQuery=function(sb,count=false){
  const p=PIPELINES[activePipeline],term=normalizeSearch(document.getElementById('employeeOrderSearch')?.value||'');
  let q=sb.from('orders').select('*',count?{count:'exact'}:{});
  if(p.branchAny){
    q=q.or('branch_id.not.is.null,branch_name.not.is.null');
    const branch=cloudId(document.getElementById('branchFilter')?.value);
    if(branch)q=q.eq('branch_id',branch);
  }else if(!p.all&&Array.isArray(p.statuses)&&p.statuses.length){
    q=q.in('status',p.statuses);
  }
  if(term){const pat=`%${term}%`;q=q.or(`order_code.ilike.${pat},reference_order_no.ilike.${pat},customer_name.ilike.${pat},customer_phone.ilike.${pat}`)}
  return q;
};
function onBranchFilterChange(){pipelinePage=1;syncEmployeeBranchManifestBar();loadPipelineOrders()}
setTimeout(syncEmployeeBranchManifestBar,0);
Object.assign(window,{switchPipeline,buildPipelineQuery,onBranchFilterChange,syncEmployeeBranchManifestBar});
</script>
'''

adm_block=r'''

<style>
/* BRANCH_EXPORT_BAR_FORCE_V2 */
#adminBranchTools.branch-manifest-visible{display:flex!important;visibility:visible!important;opacity:1!important;background:#f1f5f9!important;border:1px solid #cbd5e1!important;box-shadow:inset 0 1px 0 #fff!important;}
</style>
<script>
/* BRANCH_EXPORT_BAR_FORCE_V2 */
function syncAdminBranchManifestBar(){
  const bar=document.getElementById('adminBranchTools');
  if(!bar)return;
  const visible=activeAdminPipeline==='branch_transfer';
  bar.classList.toggle('show',visible);
  bar.classList.toggle('branch-manifest-visible',visible);
  bar.hidden=false;
  bar.style.display=visible?'flex':'none';
}
switchAdminPipeline=async function(key){
  if(!ADMIN_PIPELINES[key])return;
  activeAdminPipeline=key;
  orderPage=1;
  setActiveAdminPipelineButton(key);
  const p=ADMIN_PIPELINES[key];
  document.getElementById('adminActivePipelineLabel').innerText=p.label;
  const reward=!!p.rewards;
  document.getElementById('ordersListPanel').classList.toggle('hidden',reward);
  document.getElementById('adminRewardPanel').classList.toggle('show',reward);
  syncAdminBranchManifestBar();
  if(reward)await loadAdminRewards();
  else await loadAdminOrders();
  syncAdminBranchManifestBar();
};
function adminBranchFilterChanged(){orderPage=1;syncAdminBranchManifestBar();loadAdminOrders()}
setTimeout(syncAdminBranchManifestBar,0);
Object.assign(window,{switchAdminPipeline,adminBranchFilterChanged,syncAdminBranchManifestBar});
</script>
'''

if 'BRANCH_EXPORT_BAR_FORCE_V2' not in emp:
    Path(EMP).write_text(emp+emp_block,encoding='utf-8')
if 'BRANCH_EXPORT_BAR_FORCE_V2' not in adm:
    Path(ADM).write_text(adm+adm_block,encoding='utf-8')
