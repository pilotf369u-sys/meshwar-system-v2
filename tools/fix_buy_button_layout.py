from pathlib import Path
import re

card = Path('js/local-store-card-v3.js')
c = card.read_text(encoding='utf-8')

c, n = re.subn(
    r"\.local-v3-order\{display:flex!important;width:100%!important;min-height:48px!important;margin-top:16px!important;padding:12px 14px!important;align-items:center!important;justify-content:center!important;gap:8px!important;border-radius:12px!important;border:1px solid rgba\(96,165,250,.65\)!important;background:linear-gradient\(135deg,#2563eb,#1d4ed8\)!important;color:#ffffff!important;font-weight:700!important;font-size:1rem!important;cursor:pointer!important;box-shadow:0 4px 14px rgba\(37,99,235,.4\)!important;transition:transform .2s ease,box-shadow .2s ease,filter .2s ease!important\}",
    ".local-v3-order{display:inline-flex!important;width:100%!important;min-height:48px!important;margin-top:16px!important;padding:10px!important;align-items:center!important;justify-content:center!important;gap:8px!important;border-radius:8px!important;border:none!important;background:linear-gradient(135deg,#2563eb,#1d4ed8)!important;color:#ffffff!important;font-weight:700!important;font-size:1rem!important;cursor:pointer!important;box-shadow:0 4px 14px rgba(37,99,235,.4)!important;transition:transform .2s ease,box-shadow .2s ease,filter .2s ease!important}",
    c,
    count=1
)
if n != 1:
    raise SystemExit('CTA CSS block not found')

old = "${unavailable?'غير متوفر حالياً':'🛒 اطلب الآن'}"
new = "${unavailable?'غير متوفر حالياً':'<span aria-hidden=\"true\" style=\"display:inline-block;line-height:1\">🛒</span><span style=\"display:inline-block;line-height:1.2\">اطلب الآن</span>'}"
if old not in c:
    raise SystemExit('CTA label markup not found')
c = c.replace(old, new, 1)
card.write_text(c, encoding='utf-8')

idx = Path('index.html')
h = idx.read_text(encoding='utf-8')
h, n = re.subn(r'js/local-store-card-v3\.js\?v=[^"\']+', 'js/local-store-card-v3.js?v=cta-layout-fix-v1', h, count=1)
if n != 1:
    raise SystemExit('script reference not found')
idx.write_text(h, encoding='utf-8')
