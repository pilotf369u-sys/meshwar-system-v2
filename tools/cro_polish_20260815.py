from pathlib import Path

card = Path('js/local-store-card-v3.js')
c = card.read_text(encoding='utf-8')

old = '.local-v3-name{font-size:1.1rem!important;font-weight:900!important;color:#ffffff!important;margin-bottom:6px!important}.local-v3-desc{font-size:.95rem!important;color:#ffffff!important;font-weight:500!important;line-height:1.5!important;min-height:22px!important;margin-top:4px!important}'
new = '.local-v3-name{font-size:1.1rem!important;font-weight:700!important;color:#ffffff!important;margin-bottom:6px!important}.local-v3-desc{font-size:.9rem!important;color:#f1f5f9!important;font-weight:500!important;line-height:1.5!important;min-height:22px!important;margin-top:4px!important}'
if old not in c:
    raise SystemExit('name/description CSS block not found')
c = c.replace(old, new, 1)

old = '.local-v3-local{font-size:21px!important;font-weight:900!important;color:#fbbf24!important}.local-v3-note{display:block!important;margin-top:5px!important;color:#94a3b8!important;font-size:10px!important;font-weight:700!important}.local-v3-money{direction:ltr!important;unicode-bidi:isolate!important;display:inline-block!important;white-space:nowrap!important}'
new = '.local-v3-local{font-size:21px!important;font-weight:900!important;color:#fbbf24!important}.local-v3-note{display:block!important;margin-top:6px!important;color:#cbd5e1!important;font-size:11px!important;font-weight:600!important;line-height:1.45!important}.local-v3-money{direction:ltr!important;unicode-bidi:isolate!important;display:inline-block!important;white-space:nowrap!important}'
if old not in c:
    raise SystemExit('note CSS block not found')
c = c.replace(old, new, 1)

old = '.local-v3-order{display:flex!important;width:100%!important;min-height:48px!important;margin-top:16px!important;padding:12px 14px!important;align-items:center!important;justify-content:center!important;border-radius:12px!important;border:1px solid rgba(96,165,250,.65)!important;background:linear-gradient(90deg,#2563eb,#4f46e5)!important;color:#fff!important;font-weight:700!important;cursor:pointer!important;box-shadow:0 10px 28px rgba(37,99,235,.35)!important;transition:transform .2s ease,box-shadow .2s ease!important}.local-v3-order:hover{transform:translateY(-2px)!important;box-shadow:0 14px 34px rgba(37,99,235,.48)!important}.local-v3-order:disabled{opacity:.45!important;cursor:not-allowed!important}'
new = '.local-v3-order{display:flex!important;width:100%!important;min-height:48px!important;margin-top:16px!important;padding:12px 14px!important;align-items:center!important;justify-content:center!important;gap:8px!important;border-radius:12px!important;border:1px solid rgba(96,165,250,.65)!important;background:linear-gradient(135deg,#2563eb,#1d4ed8)!important;color:#ffffff!important;font-weight:700!important;font-size:1rem!important;cursor:pointer!important;box-shadow:0 4px 14px rgba(37,99,235,.4)!important;transition:transform .2s ease,box-shadow .2s ease,filter .2s ease!important}.local-v3-order:hover{transform:translateY(-2px)!important;box-shadow:0 8px 22px rgba(37,99,235,.5)!important;filter:brightness(1.06)!important}.local-v3-order:disabled{opacity:.45!important;cursor:not-allowed!important}'
if old not in c:
    raise SystemExit('order button CSS block not found')
c = c.replace(old, new, 1)

# Ensure explicit cart icon remains on CTA text.
c = c.replace("${unavailable?'غير متوفر حالياً':'🛒 اطلب الآن'}", "${unavailable?'غير متوفر حالياً':'🛒 اطلب الآن'}", 1)
card.write_text(c, encoding='utf-8')

idx = Path('index.html')
h = idx.read_text(encoding='utf-8')
import re
h, n = re.subn(r'js/local-store-card-v3\.js\?v=[^"\']+', 'js/local-store-card-v3.js?v=cro-20260815', h, count=1)
if n != 1:
    raise SystemExit('card script reference not found')
idx.write_text(h, encoding='utf-8')
