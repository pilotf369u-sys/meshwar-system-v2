from pathlib import Path
p=Path('vendor-dashboard.html')
s=p.read_text(encoding='utf-8')
repls={
".brand h1{margin:0;font-size:10px;font-weight:900}":".brand h1{margin:0;font-size:9px;font-weight:900}",
".brand p{margin:1px 0 0;font-size:7px}":".brand p{margin:0;font-size:6.5px}",
".order{text-align:center;font-size:10px;font-weight:900;line-height:1;direction:ltr}":".order{text-align:center;font-size:9px;font-weight:900;line-height:1;direction:ltr}",
".cell{padding:1px 2px;border:1px solid #cbd5e1;min-width:0}":".cell{padding:1px;border:1px solid #cbd5e1;min-width:0}",
".label-title{font-size:7px;color:#475569;margin-bottom:1px}":".label-title{font-size:6.5px;color:#475569;margin-bottom:0}",
".value{font-size:8px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}":".value{font-size:7.5px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
".privacy{text-align:center;font-size:7px;color:#475569;border-top:1px dashed #94a3b8;padding-top:1px;line-height:1}":".privacy{text-align:center;font-size:6.5px;color:#475569;border-top:1px dashed #94a3b8;padding-top:0;line-height:1}",
"html,body{width:50mm!important;height:40mm!important;margin:0!important;padding:1.5mm!important;box-sizing:border-box;font-size:8px;overflow:hidden}":"html,body{width:50mm!important;height:40mm!important;margin:0!important;padding:1.5mm!important;box-sizing:border-box;font-size:8px;overflow:hidden;page-break-after:avoid!important}",
".label-card{width:100%;height:100%;box-sizing:border-box;border:1px solid #000;padding:2px;display:flex;flex-direction:column;justify-content:space-between;page-break-inside:avoid;page-break-after:avoid;break-inside:avoid;overflow:hidden}":".label-card{width:100%;height:100%;max-height:37mm;box-sizing:border-box;border:1px solid #000;padding:2px;display:flex;flex-direction:column;justify-content:space-between;page-break-inside:avoid!important;page-break-after:avoid!important;break-inside:avoid!important;break-after:avoid!important;overflow:hidden}"
}
for old,new in repls.items():
    if old not in s:
        raise SystemExit('target not found: '+old[:80])
    s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
