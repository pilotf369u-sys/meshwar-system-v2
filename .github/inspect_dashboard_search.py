from pathlib import Path
import re
for fn in ['admin-dashboard.html','employee-dashboard.html','branch-dashboard.html']:
    s=Path(fn).read_text(encoding='utf-8')
    print('\n===== '+fn+' =====')
    for term in ['scheduleOrderSearch','handleOrderSearchKeydown','loadOrdersPage','loadAdminOrders','schedulePipelineSearch','handlePipelineSearchKeydown','loadPipeline','scheduleSearch','handleSearchKeydown','loadOrders','activePipeline','activeTab','statusFilter']:
        for m in re.finditer(r'(?:async\s+)?function\s+'+re.escape(term)+r'\s*\([^)]*\)\s*\{',s):
            start=m.start(); end=min(len(s),start+5000)
            print('\n--- '+term+' ---\n'+s[start:end])
