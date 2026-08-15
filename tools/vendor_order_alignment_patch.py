from pathlib import Path
p=Path('vendor-dashboard.html')
s=p.read_text(encoding='utf-8')
old="""    .vendor-responsive-table,.vendor-compact-table{width:100%;table-layout:fixed;border-collapse:collapse}\n    .vendor-responsive-table th,.vendor-responsive-table td,.vendor-compact-table th,.vendor-compact-table td{padding:.75rem .55rem;vertical-align:middle;overflow-wrap:anywhere;word-break:break-word}\n    .vendor-responsive-table th,.vendor-compact-table th{font-size:.72rem}\n"""
new="""    .vendor-responsive-table,.vendor-compact-table{width:100%;table-layout:fixed;border-collapse:collapse}\n    .vendor-responsive-table{direction:rtl}\n    .vendor-responsive-table th,.vendor-responsive-table td{padding:.75rem .45rem;vertical-align:middle;text-align:center;overflow-wrap:anywhere;word-break:break-word}\n    .vendor-responsive-table th{font-size:.72rem;font-weight:900;white-space:normal}\n    .vendor-compact-table th,.vendor-compact-table td{padding:.75rem .55rem;vertical-align:middle;overflow-wrap:anywhere;word-break:break-word}\n    .vendor-responsive-table th,.vendor-compact-table th{font-size:.72rem}\n"""
if old not in s: raise SystemExit('css anchor not found')
s=s.replace(old,new,1)
old2='''<div class="vendor-table-wrap"><table class="vendor-responsive-table text-sm"><thead class="border-b border-white/10 text-slate-400"><tr><th>رقم الطلب</th><th>المنتج</th><th>الكمية</th><th>عدد الطرود</th><th>المحافظة / المدينة</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody id="ordersBody"></tbody></table></div>'''
new2='''<div class="vendor-table-wrap"><table class="vendor-responsive-table text-sm"><colgroup><col style="width:16%"><col style="width:18%"><col style="width:8%"><col style="width:10%"><col style="width:17%"><col style="width:13%"><col style="width:18%"></colgroup><thead class="border-b border-white/10 text-slate-400"><tr><th>رقم الطلب</th><th>المنتج</th><th>الكمية</th><th>عدد الطرود</th><th>المحافظة / المدينة</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody id="ordersBody"></tbody></table></div>'''
if old2 not in s: raise SystemExit('table anchor not found')
s=s.replace(old2,new2,1)
p.write_text(s,encoding='utf-8')
print('vendor order alignment patch applied')
