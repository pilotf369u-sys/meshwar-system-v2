from pathlib import Path
p=Path('dashboard.html')
s=p.read_text(encoding='utf-8')
old='''function renderOrdersPanels(){const activeBody=document.getElementById('activeOrdersTableBody'),historyBody=document.getElementById('historyOrdersTableBody');activeBody.innerHTML='';historyBody.innerHTML='';let activeCount=0,historyCount=0;currentCustomerOrdersGlobal.forEach((o,i)=>{if(isHistoryStatus(o.status)){historyCount++;historyBody.innerHTML+=historyOrderRow(o,i)}else{activeCount++;activeBody.innerHTML+=activeOrderRow(o,i)}});if(!activeBody.innerHTML)activeBody.innerHTML='<tr><td class="empty-state" colspan="9">لا توجد طلبات نشطة حالياً.</td></tr>';if(!historyBody.innerHTML)historyBody.innerHTML='<tr><td class="empty-state" colspan="8">لا توجد طلبات سابقة بعد.</td></tr>';const activeParcels=currentCustomerOrdersGlobal.filter(o=>!isHistoryStatus(o.status)).reduce((sum,o)=>sum+getOrderParcelsCount(o),0),historyParcels=currentCustomerOrdersGlobal.filter(o=>isHistoryStatus(o.status)).reduce((sum,o)=>sum+getOrderParcelsCount(o),0);document.getElementById('activeOrdersCount').innerText=activeCount+' طلب • '+activeParcels+' طرد';document.getElementById('historyOrdersCount').innerText=historyCount+' طلب • '+historyParcels+' طرد';renderCustomerOrderBarcodes();}'''
new='''/* CUSTOMER_RENDER_INVARIANT_V48 — lock the canonical 9-column active-order template on every re-render. */
function enforceCustomerActiveOrderTemplate(){
 const body=document.getElementById('activeOrdersTableBody');if(!body)return;
 const active=currentCustomerOrdersGlobal.filter(o=>!isHistoryStatus(o.status));
 [...body.querySelectorAll('tr')].forEach((tr,rowIndex)=>{
  if(tr.querySelector('.empty-state'))return;
  const o=active[rowIndex];if(!o)return;
  const globalIndex=currentCustomerOrdersGlobal.indexOf(o);
  if(tr.children.length!==9)tr.outerHTML=activeOrderRow(o,globalIndex);
 });
}
function renderOrdersPanels(){const activeBody=document.getElementById('activeOrdersTableBody'),historyBody=document.getElementById('historyOrdersTableBody');activeBody.innerHTML='';historyBody.innerHTML='';let activeCount=0,historyCount=0;currentCustomerOrdersGlobal.forEach((o,i)=>{if(isHistoryStatus(o.status)){historyCount++;historyBody.insertAdjacentHTML('beforeend',historyOrderRow(o,i))}else{activeCount++;activeBody.insertAdjacentHTML('beforeend',activeOrderRow(o,i))}});if(!activeBody.innerHTML)activeBody.innerHTML='<tr><td class="empty-state" colspan="9">لا توجد طلبات نشطة حالياً.</td></tr>';if(!historyBody.innerHTML)historyBody.innerHTML='<tr><td class="empty-state" colspan="8">لا توجد طلبات سابقة بعد.</td></tr>';enforceCustomerActiveOrderTemplate();const activeParcels=currentCustomerOrdersGlobal.filter(o=>!isHistoryStatus(o.status)).reduce((sum,o)=>sum+getOrderParcelsCount(o),0),historyParcels=currentCustomerOrdersGlobal.filter(o=>isHistoryStatus(o.status)).reduce((sum,o)=>sum+getOrderParcelsCount(o),0);document.getElementById('activeOrdersCount').innerText=activeCount+' طلب • '+activeParcels+' طرد';document.getElementById('historyOrdersCount').innerText=historyCount+' طلب • '+historyParcels+' طرد';renderCustomerOrderBarcodes();}'''
assert old in s, 'canonical renderOrdersPanels block not found'
s=s.replace(old,new,1)
# Make the mobile pseudo-label match the canonical desktop header; no financial calculation changes.
s=s.replace('#activeOrders td:nth-child(6)::before{content:"السعر"}', '#activeOrders td:nth-child(6)::before{content:"المجموع الكلي النهائي"}', 1)
p.write_text(s,encoding='utf-8')
