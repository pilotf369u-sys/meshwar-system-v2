from pathlib import Path

card = Path('js/local-store-card-v3.js')
c = card.read_text(encoding='utf-8')
old = '''const old=hasDiscount&&oldIqd!==null?`<div class="local-v3-old-row"><del class="local-v3-old" style="text-decoration:line-through !important;color:#94a3b8;font-size:.85rem;"><span class="local-v3-money" dir="ltr">${esc(iqdLabel(oldIqd))}</span></del></div>`:'';'''
new = '''const old=hasDiscount&&oldIqd!==null?`<div class="local-v3-old-row"><span class="local-v3-old" dir="ltr" style="text-decoration: line-through !important; -webkit-text-decoration-line: line-through !important; color: #94a3b8 !important; font-size: 0.85rem; display: inline-block; direction:ltr; unicode-bidi:isolate;">${esc(iqdLabel(oldIqd))}</span></div>`:'';'''
if old not in c:
    raise SystemExit('expected old-price markup not found')
c = c.replace(old, new, 1)
card.write_text(c, encoding='utf-8')

idx = Path('index.html')
h = idx.read_text(encoding='utf-8')
old_ref = 'js/local-store-card-v3.js?v=strike-fix-v1'
new_ref = 'js/local-store-card-v3.js?v=FORCE-STRIKE-2026'
if old_ref not in h:
    raise SystemExit('expected script reference not found')
h = h.replace(old_ref, new_ref, 1)
idx.write_text(h, encoding='utf-8')
