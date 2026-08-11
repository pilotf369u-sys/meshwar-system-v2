from pathlib import Path

EMP = r'''
<style>
/* VERTICAL_STATUS_SIDEBAR_V2 */
#pipelineTabs{width:218px!important;min-width:218px!important;height:calc(100vh - 18px)!important;max-height:calc(100vh - 18px)!important;position:sticky!important;top:9px!important;overflow-y:auto!important;overflow-x:hidden!important;padding:8px!important;margin:0 0 12px 12px!important;border-radius:12px!important;gap:3px!important}
#pipelineTabs .pipeline-tab{min-height:34px!important;padding:7px 9px!important;font-size:12px!important;border-radius:8px!important;gap:6px!important}
#pipelineTabs .pipeline-count{min-width:25px!important;padding:2px 6px!important;font-size:11px!important;text-align:center!important}
.status-sidebar-title{font-size:13px!important;padding:4px 5px 8px!important}
.status-group-separator{height:1px;background:linear-gradient(90deg,transparent,#94a3b8,transparent);margin:8px 3px!important;flex:0 0 auto}
#ordersPanel,#rewardPanel{margin-right:230px!important;width:auto!important;max-width:none!important}
@media(max-width:980px){#pipelineTabs{width:100%!important;min-width:0!important;height:auto!important;max-height:none!important;position:static!important;margin:0 0 10px 0!important;display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important}.status-sidebar-title,.status-group-separator{grid-column:1/-1}#ordersPanel,#rewardPanel{margin-right:0!important;width:100%!important}}
@media(max-width:600px){#pipelineTabs{grid-template-columns:1fr!important}}
</style>
<script>
/* VERTICAL_STATUS_SIDEBAR_V2 */
Object.keys(PIPELINES).forEach(k=>delete PIPELINES[k]);
Object.assign(PIPELINES,{
all:{label:'🌐 كل الطلبات',all:true},
rewards:{label:'🎁 مستحق مكافأة',rewards:true},
cancelled:{label:'🚫 ملغية من قبل العميل',statuses:['ملغي من قبل العميل']},
waiting_employee:{label:'📩 بانتظار رد الموظف',statuses:['انتظار رد الموظف']},
waiting_customer:{label:'⏳ بانتظار موافقة العميل',statuses:['بانتظار موافقة العميل','بانتظار موافقة الزبون','بانتظار التسعير','تم التسعير / بانتظار موافقة العميل']},
waiting_payment:{label:'💳 بانتظار تأكيد الدفع',statuses:['تمت الموافقة - بانتظار الدفع','تمت الموافقة']},
paid:{label:'💰 تم التسديد',statuses:['تم التسديد']},
in_order:{label:'🔄 قيد الطلب',statuses:['قيد الطلب']},
company_store:{label:'🏢 مخزن الشركة',statuses:['مخزن شركة']},
shipping_prep:{label:'📦 تجهيز شحن',statuses:['تجهيز شحن']},
branch_transfer:{label:'🚚 محولة إلى الفرع',branchAny:true},
shipped:{label:'🚢 تم الشحن',statuses:['تم الشحن']},
local_store:{label:'🏬 مخزن محلي',statuses:['مخزن محلي']},
courier:{label:'🛵 مندوب',statuses:['مندوب']},
internal_distribution:{label:'📍 توزيع داخلي',statuses:['توزيع داخلي']},
delivered:{label:'✅ تم التسليم',statuses:['تم التسليم']},
rejected:{label:'❌ رفض التسليم',statuses:['رفض الطلب','مرفوض']}
});
const EMPLOYEE_STATUS_ORDER=[
['all','rewards','cancelled','waiting_employee','waiting_customer','waiting_payment','paid'],
['in_order','company_store','shipping_prep','branch_transfer','shipped'],
['local_store','courier','internal_distribution','delivered','rejected']
];
renderPipelineTabs=function(){const box=document.getElementById('pipelineTabs');if(!box)return;let html='<div class="status-sidebar-title">حالات الطلبات</div>';EMPLOYEE_STATUS_ORDER.forEach((group,gi)=>{if(gi)html+='<div class="status-group-separator" aria-hidden="true"></div>';group.forEach(k=>{const p=PIPELINES[k];if(!p)return;html+=`<button class="pipeline-tab ${k===activePipeline?'active':''}" data-pipeline="${k}" onclick="switchPipeline('${k}')"><span>${p.label}</span><span id="count-${k}" class="pipeline-count">${globalPipelineCounts[k]??0}</span></button>`})});box.innerHTML=html};
buildPipelineQuery=function(sb,count=false){const p=PIPELINES[activePipeline],term=normalizeSearch(document.getElementById('employeeOrderSearch')?.value||'');let q=sb.from('orders').select('*',count?{count:'exact'}:{});if(p.branchAny){q=q.or('branch_id.not.is.null,branch_name.not.is.null')}else if(!p.all&&Array.isArray(p.statuses)&&p.statuses.length){q=q.in('status',p.statuses)}if(term){const pat=`%${term}%`;q=q.or(`order_code.ilike.${pat},reference_order_no.ilike.${pat},customer_name.ilike.${pat},customer_phone.ilike.${pat}`)}return q};
refreshPipelineCounts=async function(){try{const{customers,orders,by}=await employeeRewardDataset(),next={};Object.entries(PIPELINES).forEach(([k,p])=>{if(p.all){next[k]=orders.length;return}if(p.rewards){next[k]=customers.filter(c=>employeeRewardCycle(c,by.get(cloudId(c.id))||[]).length>=EMPLOYEE_REWARD_TARGET).length;return}if(p.branchAny){next[k]=orders.filter(o=>cloudId(o.branch_id)||String(o.branch_name||'').trim()).length;return}next[k]=orders.filter(o=>(p.statuses||[]).includes(o.status)).length});globalPipelineCounts=next;Object.entries(next).forEach(([k,n])=>{const el=document.getElementById('count-'+k);if(el)el.innerText=n})}catch(e){console.error('Status sidebar V2 counters error:',e)}};
renderPipelineTabs();setActivePipelineButton(activePipeline);refreshPipelineCounts();
Object.assign(window,{renderPipelineTabs,refreshPipelineCounts});
</script>
'''

ADM = r'''
<style>
/* VERTICAL_STATUS_SIDEBAR_V2 */
#adminPipelineTabs{width:218px!important;min-width:218px!important;height:calc(100vh - 18px)!important;max-height:calc(100vh - 18px)!important;position:sticky!important;top:9px!important;overflow-y:auto!important;overflow-x:hidden!important;padding:8px!important;margin:0 0 12px 12px!important;border-radius:12px!important;gap:3px!important}
#adminPipelineTabs .pipeline-tab{min-height:34px!important;padding:7px 9px!important;font-size:12px!important;border-radius:8px!important;gap:6px!important}
#adminPipelineTabs .pipeline-count{min-width:25px!important;padding:2px 6px!important;font-size:11px!important;text-align:center!important}
.admin-status-sidebar-title{font-size:13px!important;padding:4px 5px 8px!important}
.admin-status-group-separator{height:1px;background:linear-gradient(90deg,transparent,#94a3b8,transparent);margin:8px 3px!important;flex:0 0 auto}
#ordersListPanel,#adminRewardPanel{margin-right:230px!important;width:auto!important;max-width:none!important}
@media(max-width:1050px){#adminPipelineTabs{width:100%!important;min-width:0!important;height:auto!important;max-height:none!important;position:static!important;margin:0 0 10px 0!important;display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important}.admin-status-sidebar-title,.admin-status-group-separator{grid-column:1/-1}#ordersListPanel,#adminRewardPanel{margin-right:0!important;width:100%!important}}
@media(max-width:600px){#adminPipelineTabs{grid-template-columns:1fr!important}}
</style>
<script>
/* VERTICAL_STATUS_SIDEBAR_V2 */
Object.keys(ADMIN_PIPELINES).forEach(k=>delete ADMIN_PIPELINES[k]);
Object.assign(ADMIN_PIPELINES,{
all:{label:'🌐 كل الطلبات',all:true},
rewards:{label:'🎁 مستحق مكافأة',rewards:true},
cancelled:{label:'🚫 ملغية من قبل العميل',statuses:['ملغي من قبل العميل']},
waiting_employee:{label:'📩 بانتظار رد الموظف',statuses:['انتظار رد الموظف']},
waiting_customer:{label:'⏳ بانتظار موافقة العميل',statuses:['بانتظار موافقة العميل','بانتظار موافقة الزبون','بانتظار التسعير','تم التسعير / بانتظار موافقة العميل']},
waiting_payment:{label:'💳 بانتظار تأكيد الدفع',statuses:['تمت الموافقة - بانتظار الدفع','تمت الموافقة']},
paid:{label:'💰 تم التسديد',statuses:['تم التسديد']},
in_order:{label:'🔄 قيد الطلب',statuses:['قيد الطلب']},
company_store:{label:'🏢 مخزن الشركة',statuses:['مخزن شركة']},
shipping_prep:{label:'📦 تجهيز شحن',statuses:['تجهيز شحن']},
branch_transfer:{label:'🚚 محولة إلى الفرع',branchAny:true},
shipped:{label:'🚢 تم الشحن',statuses:['تم الشحن']},
local_store:{label:'🏬 مخزن محلي',statuses:['مخزن محلي']},
courier:{label:'🛵 مندوب',statuses:['مندوب']},
internal_distribution:{label:'📍 توزيع داخلي',statuses:['توزيع داخلي']},
delivered:{label:'✅ تم التسليم',statuses:['تم التسليم']},
rejected:{label:'❌ رفض التسليم',statuses:['رفض الطلب','مرفوض']}
});
const ADMIN_STATUS_ORDER=[
['all','rewards','cancelled','waiting_employee','waiting_customer','waiting_payment','paid'],
['in_order','company_store','shipping_prep','branch_transfer','shipped'],
['local_store','courier','internal_distribution','delivered','rejected']
];
renderAdminPipelineTabs=function(){const box=document.getElementById('adminPipelineTabs');if(!box)return;let html='<div class="admin-status-sidebar-title">حالات الطلبات</div>';ADMIN_STATUS_ORDER.forEach((group,gi)=>{if(gi)html+='<div class="admin-status-group-separator" aria-hidden="true"></div>';group.forEach(k=>{const p=ADMIN_PIPELINES[k];if(!p)return;html+=`<button class="pipeline-tab ${k===activeAdminPipeline?'active':''}" data-pipeline="${k}" onclick="switchAdminPipeline('${k}')"><span>${p.label}</span><span id="admin-count-${k}" class="pipeline-count">${globalAdminPipelineCounts[k]??0}</span></button>`})});box.innerHTML=html};
refreshAdminPipelineCounts=async function(){try{const{customers,orders,by}=await adminRewardDataset(),next={};Object.entries(ADMIN_PIPELINES).forEach(([k,p])=>{if(p.all){next[k]=orders.length;return}if(p.rewards){next[k]=customers.filter(c=>adminRewardCycleOf(c,by.get(String(c.id))||[]).length>=ADMIN_REWARD_TARGET).length;return}if(p.branchAny){next[k]=orders.filter(o=>String(o.branch_id||'').trim()||String(o.branch_name||'').trim()).length;return}next[k]=orders.filter(o=>(p.statuses||[]).includes(o.status)).length});globalAdminPipelineCounts=next;Object.entries(next).forEach(([k,n])=>{const el=document.getElementById('admin-count-'+k);if(el)el.innerText=n})}catch(e){console.error('Admin status sidebar V2 counters error:',e)}};
loadAdminOrders=async function(){const p=ADMIN_PIPELINES[activeAdminPipeline];if(p.rewards)return;const body=document.getElementById('adminOrdersTableBody');body.innerHTML='<tr><td colspan="9">جاري التحميل...</td></tr>';const rid=++orderSearchRequestId;try{const sb=await ensureCustomerSupabase(),term=searchTerm(document.getElementById('orderSearchInput')?.value||'');let customerIds=[];if(term){const pat=`%${term}%`,{data}=await sb.from('customers').select('id').or(`name.ilike.${pat},phone.ilike.${pat},secondary_phone.ilike.${pat},code.ilike.${pat},email.ilike.${pat}`).limit(500);customerIds=(data||[]).map(x=>x.id)}let q=sb.from('orders').select('*',{count:'exact'});if(p.branchAny){q=q.or('branch_id.not.is.null,branch_name.not.is.null');const bid=document.getElementById('adminBranchFilter')?.value;if(bid)q=q.eq('branch_id',bid)}else if(!p.all&&Array.isArray(p.statuses)&&p.statuses.length){q=q.in('status',p.statuses)}if(term){const pat=`%${term}%`,ors=[`order_code.ilike.${pat}`,`reference_order_no.ilike.${pat}`,`customer_name.ilike.${pat}`,`customer_phone.ilike.${pat}`];if(customerIds.length)ors.push(`customer_id.in.(${customerIds.join(',')})`);q=q.or(ors.join(','))}const from=(orderPage-1)*orderPageSize,{data,error,count}=await q.order('created_at',{ascending:false}).range(from,from+orderPageSize-1);if(rid!==orderSearchRequestId)return;if(error)throw error;orderTotal=count||0;adminOrdersCloud=(data||[]).map(normalizeAdminOrderMetrics);await enrichCustomerCodes(adminOrdersCloud);body.innerHTML='';adminOrdersCloud.forEach(o=>body.innerHTML+=adminOrderRow(o));if(!body.innerHTML)body.innerHTML='<tr><td colspan="9">لا توجد طلبات في هذا القسم.</td></tr>';renderOrderPagination();await renderAdminBarcodes()}catch(e){console.error('Admin status sidebar V2 load error:',e);body.innerHTML=`<tr><td colspan="9" style="color:red">${esc(e.message||e)}</td></tr>`}};
renderAdminPipelineTabs();setActiveAdminPipelineButton(activeAdminPipeline);refreshAdminPipelineCounts();
Object.assign(window,{renderAdminPipelineTabs,refreshAdminPipelineCounts,loadAdminOrders});
</script>
'''

for name, chunk in [('employee-dashboard.html', EMP), ('admin-dashboard.html', ADM)]:
    p=Path(name)
    s=p.read_text(encoding='utf-8')
    if 'VERTICAL_STATUS_SIDEBAR_V2' not in s:
        s += '\n' + chunk
        p.write_text(s,encoding='utf-8')
