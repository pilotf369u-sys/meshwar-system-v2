from pathlib import Path
p=Path('delivery-dashboard.html')
s=p.read_text(encoding='utf-8')
old="style=\"display:${o.status==='مؤجل'?'block':'none'}\""
new="style=\"display:${(d.delivery_state==='deferred'||d.delivery_deferred_until)?'block':'none'}\""
if old not in s:
    raise SystemExit('deferred visibility target not found')
p.write_text(s.replace(old,new,1),encoding='utf-8')
