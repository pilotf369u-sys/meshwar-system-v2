from pathlib import Path
import re

card = Path('js/local-store-card-v3.js')
c = card.read_text(encoding='utf-8')

# Remove any pseudo-elements from the actual product order button.
needle = ".local-v3-order:disabled{opacity:.45!important;cursor:not-allowed!important}"
replacement = needle + ".local-v3-order::before,.local-v3-order::after{content:none!important;display:none!important}"
if needle not in c:
    raise SystemExit('order button disabled CSS marker not found')
c = c.replace(needle, replacement, 1)

# Make button plain centered text only; no emoji, SVG, span, or icon markup.
old = "${unavailable?'غير متوفر حالياً':'<span aria-hidden=\"true\" style=\"display:inline-block;line-height:1\">🛒</span><span style=\"display:inline-block;line-height:1.2\">اطلب الآن</span>'}"
new = "${unavailable?'غير متوفر حالياً':'اطلب الآن'}"
if old not in c:
    raise SystemExit('current CTA icon markup not found')
c = c.replace(old, new, 1)

# Keep button centered and remove unused gap.
c = c.replace('display:inline-flex!important;', 'display:flex!important;', 1)
c = c.replace('gap:8px!important;', 'gap:0!important;', 1)
card.write_text(c, encoding='utf-8')

idx = Path('index.html')
h = idx.read_text(encoding='utf-8')
h, n = re.subn(r'js/local-store-card-v3\.js\?v=[^"\']+', 'js/local-store-card-v3.js?v=clean-btn-2026', h, count=1)
if n != 1:
    raise SystemExit('local-store-card-v3 script reference not found')
idx.write_text(h, encoding='utf-8')
