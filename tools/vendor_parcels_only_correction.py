from pathlib import Path
p=Path('vendor-dashboard.html')
s=p.read_text(encoding='utf-8')
# Undo accidental products empty-row colspan change.
s=s.replace("$('productsBody').innerHTML=rows||'<tr><td colspan=\"7\" class=\"p-6 text-center text-slate-400\">لا توجد منتجات بعد.</td></tr>';","$('productsBody').innerHTML=rows||'<tr><td colspan=\"6\" class=\"p-6 text-center text-slate-400\">لا توجد منتجات بعد.</td></tr>';",1)
# Correct only the orders empty-row colspan for the new parcels column.
s=s.replace("'<tr><td colspan=\"6\" class=\"p-6 text-center text-slate-400\">لا توجد طلبات واردة لهذا المتجر.</td></tr>'","'<tr><td colspan=\"7\" class=\"p-6 text-center text-slate-400\">لا توجد طلبات واردة لهذا المتجر.</td></tr>'",1)
p.write_text(s,encoding='utf-8')
