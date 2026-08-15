from pathlib import Path
import re

# 1) Persist governorate for new local-store orders from the actual customer field used by admin (state).
p = Path('js/local-store-card-v3.js')
s = p.read_text(encoding='utf-8')
old = "governorate:customer.governorate||customer.city||customer.province||''"
new = "governorate:customer.governorate||customer.state||customer.city||customer.province||''"
if old not in s:
    raise SystemExit('local-store governorate payload target not found')
s = s.replace(old, new, 1)
p.write_text(s, encoding='utf-8')

# 2) Vendor: read governorate from normalized details, including state and nested customer state.
p = Path('vendor-dashboard.html')
s = p.read_text(encoding='utf-8')
old = "function orderCity(o){const d=normalizeOrderDetails(o?.details),c=(d.customer&&typeof d.customer==='object')?d.customer:{};return o?.governorate||o?.city||d.governorate||d.city||d.province||d.customer_city||c.governorate||c.city||c.province||'غير محددة'}"
new = "function orderCity(o){const d=normalizeOrderDetails(o?.details),c=(d.customer&&typeof d.customer==='object')?d.customer:{};return o?.governorate||o?.city||d.governorate||d.state||d.city||d.province||d.customer_city||c.governorate||c.state||c.city||c.province||'غير محددة'}"
if old not in s:
    raise SystemExit('vendor orderCity target not found')
s = s.replace(old, new, 1)
p.write_text(s, encoding='utf-8')

# 3) Employee order details: show governorate using the same broad fallback order.
p = Path('employee-dashboard.html')
s = p.read_text(encoding='utf-8')
old = "<div class=\"detail-box\"><b>الفرع:</b> ${escapeHtml(o.branch_name||'---')}</div><div class=\"detail-box\"><b>اللون:</b>"
new = "<div class=\"detail-box\"><b>الفرع:</b> ${escapeHtml(o.branch_name||'---')}</div><div class=\"detail-box\"><b>المحافظة:</b> ${escapeHtml(o.governorate||o.city||d.governorate||d.state||d.city||((d.customer&&typeof d.customer==='object')?(d.customer.governorate||d.customer.state||d.customer.city):'')||'غير محددة')}</div><div class=\"detail-box\"><b>اللون:</b>"
if old not in s:
    raise SystemExit('employee details governorate insertion target not found')
s = s.replace(old, new, 1)
p.write_text(s, encoding='utf-8')

# 4) Admin order details: same read strategy.
p = Path('admin-dashboard.html')
s = p.read_text(encoding='utf-8')
old = "<div class=\"detail-box\"><b>الفرع:</b> ${esc(o.branch_name||'---')}</div><div class=\"detail-box\"><b>اللون:</b>"
new = "<div class=\"detail-box\"><b>الفرع:</b> ${esc(o.branch_name||'---')}</div><div class=\"detail-box\"><b>المحافظة:</b> ${esc(o.governorate||o.city||d.governorate||d.state||d.city||((d.customer&&typeof d.customer==='object')?(d.customer.governorate||d.customer.state||d.customer.city):'')||'غير محددة')}</div><div class=\"detail-box\"><b>اللون:</b>"
if old not in s:
    raise SystemExit('admin details governorate insertion target not found')
s = s.replace(old, new, 1)
p.write_text(s, encoding='utf-8')

# 5) Force browsers to load the order-creation fix immediately.
p = Path('index.html')
s = p.read_text(encoding='utf-8')
s2, n = re.subn(r'js/local-store-card-v3\.js\?v=[^\"\']+', 'js/local-store-card-v3.js?v=governorate-fix-v1', s, count=1)
if n != 1:
    raise SystemExit('index local-store-card-v3 cache-bust target not found')
p.write_text(s2, encoding='utf-8')
