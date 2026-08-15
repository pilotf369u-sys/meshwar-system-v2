from pathlib import Path

card=Path('js/local-store-card-v3.js')
c=card.read_text(encoding='utf-8')
old='const old=hasDiscount&&oldIqd!==null?`<div class="local-v3-old-row"><span class="local-v3-old"><span class="local-v3-money" dir="ltr">${esc(iqdLabel(oldIqd))}</span></span></div>`:\'\';'
new='const old=hasDiscount&&oldIqd!==null?`<div class="local-v3-old-row"><del class="local-v3-old" style="text-decoration:line-through !important;color:#94a3b8;font-size:.85rem;"><span class="local-v3-money" dir="ltr">${esc(iqdLabel(oldIqd))}</span></del></div>`:\'\';'
if old not in c:
    raise SystemExit('old price markup not found')
c=c.replace(old,new,1)
card.write_text(c,encoding='utf-8')

idx=Path('index.html')
h=idx.read_text(encoding='utf-8')
import re
h,n=re.subn(r'js/local-store-card-v3\.js\?v=[^"\']+', 'js/local-store-card-v3.js?v=strike-fix-v1', h, count=1)
if n!=1:
    raise SystemExit('card script cache-bust reference not found')
idx.write_text(h,encoding='utf-8')
