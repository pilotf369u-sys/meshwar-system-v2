from pathlib import Path
import re

# 1) Customer: cancellation-only controls before payment.
dash = Path('dashboard.html')
text = dash.read_text(encoding='utf-8')
replacement = '''function customerDecisionHtml(order,index,price,currency){const status=String(order.status||'انتظار رد الموظف').trim(),priced=price!==null&&Number.isFinite(price)&&price>0,editable=canCustomerEditStatus(status);if(!editable)return '---';const cancel=`<button class="btn-cancel" style="margin:3px" onclick="cancelOrder(${index})">🗑️ إلغاء الطلب</button>`;if(isWaitingCustomerApprovalStatus(status)&&priced)return `<div class="decision-box"><div style="margin-bottom:7px;font-weight:bold;color:#f5c451">السعر المقترح: ${price.toFixed(2)} ${escapeHtml(currency)}</div><button class="btn-approve" onclick="approveOrder(${index})">موافقة على الشراء</button><br>${cancel}</div>`;if(status==='تمت الموافقة - بانتظار الدفع'||status==='تمت الموافقة')return `<div class="decision-box"><div class="payment-box" style="margin-bottom:7px"><b>الطلب قبل التسديد</b><br><b>المبلغ:</b> ${price===null?'---':price.toFixed(2)+' '+escapeHtml(currency)}</div>${cancel}</div>`;return `<div class="decision-box">${cancel}</div>`;}\nfunction getOrderSiparisNo'''
text2, n = re.subn(r"function customerDecisionHtml\(order,index,price,currency\)\{.*?\}\nfunction getOrderSiparisNo", replacement, text, count=1, flags=re.S)
if n != 1:
    raise SystemExit(f'customerDecisionHtml patch count={n}')
segment = text2[text2.find('function customerDecisionHtml'):text2.find('function getOrderSiparisNo')]
if '✏️ تعديل الطلب' in segment or 'editCustomerOrder(' in segment:
    raise SystemExit('edit control still present in customer decision renderer')
dash.write_text(text2, encoding='utf-8')

# 2) Store: keep the strong direct-product pulse visible for about 24 seconds.
js = Path('js/local-store-card-v3.js')
j = js.read_text(encoding='utf-8')
old = 'animation:kintoDirectProductPulseV32Strong .72s ease-in-out 6!important;'
new = 'animation:kintoDirectProductPulseV32Strong 1.2s ease-in-out 20!important;'
if old in j:
    j = j.replace(old, new, 1)
elif new not in j:
    raise SystemExit('direct-product pulse signature not found')
js.write_text(j, encoding='utf-8')

# 3) Cache-bust the active storefront module so users receive V33 immediately.
idx = Path('index.html')
i = idx.read_text(encoding='utf-8')
i2, m = re.subn(r'js/local-store-card-v3\.js\?v=[^"\']+', 'js/local-store-card-v3.js?v=20260829-final-v33', i, count=1)
if m != 1:
    raise SystemExit(f'index cache-bust patch count={m}')
idx.write_text(i2, encoding='utf-8')

print('V33 final customer cancellation-only policy + extended pulse applied')
