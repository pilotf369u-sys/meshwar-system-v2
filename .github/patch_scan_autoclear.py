from pathlib import Path
files=['admin-dashboard.html','employee-dashboard.html','branch-dashboard.html','delivery-dashboard.html']
for fn in files:
    p=Path(fn); s=p.read_text(encoding='utf-8')
    old="if(input){\n      input.value=clean;"
    new="if(input){\n      input.value='';\n      input.value=clean;"
    if old in s:
        s=s.replace(old,new,1)
    else:
        old2="if(input){input.value=clean;"
        new2="if(input){input.value='';input.value=clean;"
        if old2 in s:
            s=s.replace(old2,new2,1)
        else:
            raise SystemExit(f'{fn}: scan success assignment not found')
    p.write_text(s,encoding='utf-8')
print('patched', ', '.join(files))
