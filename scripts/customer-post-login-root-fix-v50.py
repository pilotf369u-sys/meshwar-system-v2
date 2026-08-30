from pathlib import Path

# 1) Stop the login shell from injecting external-shipping legacy renderers into customer dashboard.
shell = Path('external-shipping-shell.html')
s = shell.read_text(encoding='utf-8')
needle = """        customerPolish.src='js/customer-light-polish-v1.js?v=20260826-customer-polish-v1.1-final';\n        d.head.appendChild(customerPolish);\n      }\n"""
replacement = """        customerPolish.src='js/customer-light-polish-v1.js?v=20260826-customer-polish-v1.1-final';\n        d.head.appendChild(customerPolish);\n        return; // CUSTOMER_POST_LOGIN_ROOT_FIX_V50: customer uses dashboard.html canonical renderer only.\n      }\n"""
assert needle in s, 'customer shell block not found'
s = s.replace(needle, replacement, 1)
shell.write_text(s, encoding='utf-8')

# 2) Delete the obsolete customer popup wrapper from external-shipping-fee-v2.js.
p = Path('js/external-shipping-fee-v2.js')
s = p.read_text(encoding='utf-8')
start = s.index('async function fetchCustomerOrderFromModal(){')
end = s.index("\nif(screen==='employee')", start)
s = s[:start] + "\n/* CUSTOMER_POST_LOGIN_ROOT_FIX_V50: legacy customer invoice injector removed. */\n" + s[end:]
s = s.replace("else if(screen==='customer')installCustomer();", "")
p.write_text(s, encoding='utf-8')

# 3) Delete the obsolete customer table/header/decision re-rendering from UI polish.
p = Path('js/external-shipping-ui-polish-v3.js')
s = p.read_text(encoding='utf-8')
start = s.index('function customerCurrency(o){')
end = s.index("if(screen==='employee'||screen==='admin')wrapRenderForPolish();", start)
s = s[:start] + "/* CUSTOMER_POST_LOGIN_ROOT_FIX_V50: legacy customer table/header renderer removed. */\n" + s[end:]
s = s.replace("if(screen==='customer')installCustomer();\n", "")
p.write_text(s, encoding='utf-8')

# 4) Hard invariants: customer table remains owned exclusively by dashboard.html.
dashboard = Path('dashboard.html').read_text(encoding='utf-8')
fee = Path('js/external-shipping-fee-v2.js').read_text(encoding='utf-8')
polish = Path('js/external-shipping-ui-polish-v3.js').read_text(encoding='utf-8')
shell_text = shell.read_text(encoding='utf-8')

assert dashboard.count('<th>المجموع الكلي النهائي</th>') == 1
assert 'function activeOrderRow' in dashboard and 'grandTotal.toFixed(2)' in dashboard
for forbidden in [
    'appendCustomerInvoice',
    '__mwExternalCustomerDetailsV2',
    'installCustomerRows',
    'addCustomerHeaders',
    '__mwExternalCustomerActiveV3',
    '__mwExternalCustomerHistoryV3',
    '__mwExternalRenderPanelsV3',
    'يشمل سعر السلعة + الشحن الخارجي',
]:
    assert forbidden not in fee + polish, forbidden
assert "return; // CUSTOMER_POST_LOGIN_ROOT_FIX_V50" in shell_text
