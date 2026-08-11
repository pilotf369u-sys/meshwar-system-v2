from pathlib import Path
import re

EMP='employee-dashboard.html'
ADM='admin-dashboard.html'

route_re = re.compile(r'\n?<script>\n/\* BRANCH_MANIFEST_TAB_ROUTE_V1 \*/.*?</script>\s*$', re.S)
restore_re = re.compile(r'\n?<style>\n/\* BRANCH_EXPORT_BAR_RESTORE_V1 \*/.*?</script>\s*$', re.S)

emp = Path(EMP).read_text(encoding='utf-8')
emp = route_re.sub('', emp)
emp = restore_re.sub('', emp)
emp += r'''

<style>
/* BRANCH_EXPORT_BAR_RESTORE_V1 */
#branchTools{background:#f1f5f9!important;border:1px solid #cbd5e1!important;box-shadow:inset 0 1px 0 #fff;}
#branchTools.show{display:flex!important;}
</style>
<script>
/* BRANCH_EXPORT_BAR_RESTORE_V1 */
switchPipeline=async function(key){
  if(!PIPELINES[key])return;
  activePipeline=key;
  pipelinePage=1;
  setActivePipelineButton(key);
  const p=PIPELINES[key];
  document.getElementById('activePipelineLabel').innerText=p.label;
  const reward=!!p.rewards;
  const manifestTools=key==='branch_transfer'||!!p.branch;
  document.getElementById('ordersPanel').classList.toggle('hidden',reward);
  document.getElementById('rewardPanel').classList.toggle('show',reward);
  document.getElementById('branchTools').classList.toggle('show',manifestTools&&!reward);
  if(reward)await loadRewardsManagementTable();
  else await loadPipelineOrders();
};
function onBranchFilterChange(){pipelinePage=1;loadPipelineOrders()}
Object.assign(window,{switchPipeline,onBranchFilterChange});
</script>
'''
Path(EMP).write_text(emp, encoding='utf-8')

adm = Path(ADM).read_text(encoding='utf-8')
adm = route_re.sub('', adm)
adm = restore_re.sub('', adm)
adm += r'''

<style>
/* BRANCH_EXPORT_BAR_RESTORE_V1 */
#adminBranchTools{background:#f1f5f9!important;border:1px solid #cbd5e1!important;box-shadow:inset 0 1px 0 #fff;}
#adminBranchTools.show{display:flex!important;}
</style>
<script>
/* BRANCH_EXPORT_BAR_RESTORE_V1 */
switchAdminPipeline=async function(key){
  if(!ADMIN_PIPELINES[key])return;
  activeAdminPipeline=key;
  orderPage=1;
  setActiveAdminPipelineButton(key);
  const p=ADMIN_PIPELINES[key];
  document.getElementById('adminActivePipelineLabel').innerText=p.label;
  const reward=!!p.rewards;
  const manifestTools=key==='branch_transfer'||!!p.branch;
  document.getElementById('ordersListPanel').classList.toggle('hidden',reward);
  document.getElementById('adminRewardPanel').classList.toggle('show',reward);
  document.getElementById('adminBranchTools').classList.toggle('show',manifestTools&&!reward);
  if(reward)await loadAdminRewards();
  else await loadAdminOrders();
};
function adminBranchFilterChanged(){orderPage=1;loadAdminOrders()}
Object.assign(window,{switchAdminPipeline,adminBranchFilterChanged});
</script>
'''
Path(ADM).write_text(adm, encoding='utf-8')
