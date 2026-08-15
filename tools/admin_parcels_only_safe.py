from pathlib import Path

p = Path('admin-dashboard.html')
s = p.read_text(encoding='utf-8')

old = "async function adminOrderParcelsCount(o){const d=parseAdminOrderDetails(o?.details),n=Number(d?.parcels_count??1);return Number.isFinite(n)&&n>=1?Math.max(1,Math.floor(n)):1}"
new = "function adminOrderParcelsCount(o){const d=parseAdminOrderDetails(o?.details),n=Number(d?.parcels_count??1);return Number.isFinite(n)&&n>=1?Math.max(1,Math.floor(n)):1}"
if old not in s:
    raise SystemExit('adminOrderParcelsCount async signature not found')
s = s.replace(old, new, 1)

old_qty = '<td><span class="qty-badge">${esc(qty)}</span></td>'
new_qty = '<td><span class="qty-badge">${esc(qty)}</span><div class="mini" style="margin-top:6px;font-weight:900;color:#7c3aed">📦 الطرود: ${esc(adminOrderParcelsCount(o))}</div></td>'
if old_qty not in s:
    raise SystemExit('main admin quantity cell not found')
s = s.replace(old_qty, new_qty, 1)

required = [
    'function adminOrderParcelsCount(o)',
    '📦 الطرود: ${esc(adminOrderParcelsCount(o))}',
    '<b>عدد الطرود:</b> <span class="qty-badge">${esc(adminOrderParcelsCount(o))}</span>'
]
for token in required:
    if token not in s:
        raise SystemExit(f'missing required token: {token}')

p.write_text(s, encoding='utf-8')
