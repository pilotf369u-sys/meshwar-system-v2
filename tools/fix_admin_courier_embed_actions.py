from pathlib import Path
p=Path('admin-delivery-reports.html')
t=p.read_text(encoding='utf-8')
old='html.admin-embedded .actions{display:none}'
new='html.admin-embedded .actions a{display:none!important}'
if t.count(old)!=1: raise SystemExit(f'expected one actions rule, found {t.count(old)}')
t=t.replace(old,new,1)
p.write_text(t,encoding='utf-8')
print('courier embedded actions fixed')
