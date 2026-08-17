from pathlib import Path
import re

p=Path('branch-dashboard.html')
s=p.read_text(encoding='utf-8')

pattern=re.compile(r'\n<script>\n/\* BRANCH_LUXURY_UI_HELPERS_V1 .*?</script>\n',re.S)
m=pattern.search(s)
if not m:
    raise SystemExit('Luxury helper block not found')
helper=m.group(0)
s=s[:m.start()]+'\n'+s[m.end():]

# Append the helper only as a real top-level script after all existing markup/scripts.
s=s.rstrip()+helper+'\n'

# Guard against this regression: helper must no longer sit inside branchPrintShippingLabel/openPrint source region.
helper_pos=s.rfind('BRANCH_LUXURY_UI_HELPERS_V1')
print_label_pos=s.find('function branchPrintShippingLabel')
open_print_pos=s.find('function openPrint')
if helper_pos < max(print_label_pos, open_print_pos):
    raise SystemExit('Helper was not relocated to the end of the document')

# The main print templates must keep escaped closing script tags so the HTML parser does not terminate the dashboard script.
for marker in ('function branchPrintShippingLabel','function openPrint'):
    i=s.find(marker)
    if i<0: raise SystemExit(f'{marker} missing')
    chunk=s[i:i+12000]
    if '<\\/script>' not in chunk:
        raise SystemExit(f'Escaped closing script missing near {marker}')

p.write_text(s,encoding='utf-8')
print('Hotfix applied')
