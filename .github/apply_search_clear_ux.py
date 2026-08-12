from pathlib import Path
import re

FILES={
'admin-dashboard.html':{
 'input_id':'orderSearchInput','load':'loadAdminOrders()','page':'orderPage=1;','input_handler':'adminBarcodeSearchInput(event)','keyup':'adminBarcodeSearchKeyup(event)'
},
'employee-dashboard.html':{
 'input_id':'employeeOrderSearch','load':'loadPipelineOrders()','page':'pipelinePage=1;','input_handler':'employeeBarcodeSearchInput(event)','keyup':'employeeBarcodeSearchKeyup(event)'
},
'branch-dashboard.html':{
 'input_id':'orderSearch','load':'loadOrders()','page':'page=1;barcodeScanPending=false;','input_handler':'branchBarcodeSearchInput(event)','keyup':'branchBarcodeSearchKeyup(event)'
},
'delivery-dashboard.html':{
 'input_id':'deliverySearch','load':'loadDeliveryOrders()','page':'deliveryPage=1;','input_handler':'deliverySearchInput(event)','keyup':'deliverySearchKeyup(event)'
}
}

for fn,cfg in FILES.items():
    p=Path(fn); s=p.read_text(encoding='utf-8')
    iid=cfg['input_id']

    if f'data-clear-search="{iid}"' not in s:
        pat=rf'(<input\b[^>]*\bid="{re.escape(iid)}"[^>]*>)'
        repl=r'''\1<button type="button" data-clear-search="'''+iid+r'''" title="مسح البحث" aria-label="مسح البحث" onclick="clearBarcodeSearchInput()" style="width:36px;height:36px;padding:0;border-radius:50%;background:#64748b;color:#fff;font-size:20px;line-height:1;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;">×</button>'''
        s,n=re.subn(pat,repl,s,count=1)
        if n!=1: raise SystemExit(f'{fn}: search input not found')

    if 'function clearBarcodeSearchInput()' not in s:
        marker='function cleanBarcodeScannerInput(value)'
        i=s.find(marker)
        if i<0: raise SystemExit(f'{fn}: cleanBarcodeScannerInput not found')
        helper=f'''let barcodeScannerLastKeyAt=0;\nfunction clearBarcodeSearchInput(){{\n  const input=document.getElementById('{iid}');\n  if(!input)return;\n  input.value='';\n  {cfg['page']}\n  input.dispatchEvent(new Event('input',{{bubbles:true}}));\n  input.focus();\n}}\nfunction prepareBarcodeScannerBurst(event){{\n  const input=event?.target||document.getElementById('{iid}');\n  if(!input||event.ctrlKey||event.metaKey||event.altKey||String(event.key||'').length!==1)return;\n  const now=Date.now();\n  const gap=now-barcodeScannerLastKeyAt;\n  barcodeScannerLastKeyAt=now;\n  if(input.value&&gap>180&&input.selectionStart===input.selectionEnd){{\n    const existing=cleanBarcodeScannerInput(input.value);\n    if(existing&&/^(?:MW-?)?[A-Z0-9-]*\\d[A-Z0-9-]*$/.test(existing))input.value='';\n  }}\n}}\n'''
        s=s[:i]+helper+s[i:]

    input_match=re.search(rf'<input\b[^>]*\bid="{re.escape(iid)}"[^>]*>',s)
    if not input_match: raise SystemExit(f'{fn}: input missing after patch')
    tag=input_match.group(0)
    if 'prepareBarcodeScannerBurst(event)' not in tag:
        if 'onkeydown="' in tag:
            tag2=re.sub(r'onkeydown="([^"]*)"',lambda m:'onkeydown="prepareBarcodeScannerBurst(event);'+m.group(1)+'"',tag,count=1)
        else:
            tag2=tag[:-1]+' onkeydown="prepareBarcodeScannerBurst(event)">'
        s=s[:input_match.start()]+tag2+s[input_match.end():]

    start='async function startCameraScanner()'
    pos=s.find(start)
    if pos<0: raise SystemExit(f'{fn}: startCameraScanner not found')
    brace=s.find('{',pos)
    insertion=f"\n  const searchInput=document.getElementById('{iid}');\n  if(searchInput&&searchInput.value){{searchInput.value='';searchInput.dispatchEvent(new Event('input',{{bubbles:true}}));}}\n"
    nearby=s[brace:brace+500]
    if "const searchInput=document.getElementById('"+iid+"')" not in nearby:
        s=s[:brace+1]+insertion+s[brace+1:]

    p.write_text(s,encoding='utf-8')

print('Patched:', ', '.join(FILES))
# trigger
