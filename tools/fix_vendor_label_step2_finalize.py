from pathlib import Path
p=Path('vendor-dashboard.html')
s=p.read_text(encoding='utf-8')
repls={
"date=new Date(o.created_at).toLocaleDateString('ar-IQ')":"date=new Date(o.created_at).toLocaleDateString('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}).replaceAll('-','/')",
".privacy{text-align:center;font-size:6.5px;color:#475569;border-top:1px dashed #94a3b8;padding-top:0;line-height:1}":"",
"<div class=\"cell\"><div class=\"label-title\">الكمية</div><div class=\"value\">${qty}</div></div>":"<div class=\"cell\"><div class=\"label-title\">الكمية</div><div class=\"value\">${qty} قطع</div></div>",
"</div><div class=\"privacy\">MeshWar Cargo</div></div>":"</div></div>"
}
for old,new in repls.items():
    if old not in s:
        raise SystemExit('target not found: '+old[:100])
    s=s.replace(old,new,1)
# Ensure print geometry is explicitly fixed and overflow locked.
required=["@page{size:50mm 40mm;margin:0}","html,body{width:50mm!important;height:40mm!important", "overflow:hidden", "height:22px"]
for x in required:
    if x not in s:
        raise SystemExit('required print geometry missing: '+x)
p.write_text(s,encoding='utf-8')
