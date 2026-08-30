from pathlib import Path
p=Path('dashboard.html')
s=p.read_text(encoding='utf-8')
start=s.index('/* CUSTOMER_RENDER_INVARIANT_V48')
end=s.index('function renderCloudNotifications()', start)
canonical="""/* CUSTOMER_RENDER_ROOT_CLEAN_V49 — one canonical render path; active table has exactly one money column. */
function renderOrdersPanels(){
 const activeBody=document.getElementById('activeOrdersTableBody'),historyBody=document.getElementById('historyOrdersTableBody');
 const activeRows=[],historyRows=[];let activeCount=0,historyCount=0;
 currentCustomerOrdersGlobal.forEach((o,i)=>{if(isHistoryStatus(o.status)){historyCount++;historyRows.push(historyOrderRow(o,i))}else{activeCount++;activeRows.push(activeOrderRow(o,i))}});
 activeBody.innerHTML=activeRows.join('')||'<tr><td class="empty-state" colspan="9">لا توجد طلبات نشطة حالياً.</td></tr>';
 historyBody.innerHTML=historyRows.join('')||'<tr><td class="empty-state" colspan="8">لا توجد طلبات سابقة بعد.</td></tr>';
 const activeParcels=currentCustomerOrdersGlobal.filter(o=>!isHistoryStatus(o.status)).reduce((sum,o)=>sum+getOrderParcelsCount(o),0),historyParcels=currentCustomerOrdersGlobal.filter(o=>isHistoryStatus(o.status)).reduce((sum,o)=>sum+getOrderParcelsCount(o),0);
 document.getElementById('activeOrdersCount').innerText=activeCount+' طلب • '+activeParcels+' طرد';document.getElementById('historyOrdersCount').innerText=historyCount+' طلب • '+historyParcels+' طرد';renderCustomerOrderBarcodes();
}
"""
s=s[:start]+canonical+s[end:]
# hard invariants: no old helper and no legacy explanatory total text in the customer dashboard source
for forbidden in ['enforceCustomerActiveOrderTemplate','يشمل سعر السلعة','سعر السلعة + الشحن الخارجي']:
    assert forbidden not in s, forbidden
assert s.count('<th>المجموع الكلي النهائي</th>')==1
assert 'function activeOrderRow' in s and 'grandTotal.toFixed(2)' in s
p.write_text(s,encoding='utf-8')
