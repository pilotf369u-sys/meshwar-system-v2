from pathlib import Path

p=Path('vendor-dashboard-v2.html')
s=p.read_text(encoding='utf-8')

css='''\n    /* V35 FINAL UX — light contrast + sticky orders header + live filter counters */\n    .vendor-order-count{display:inline-flex;min-width:1.55rem;height:1.55rem;align-items:center;justify-content:center;margin-inline-start:.35rem;border-radius:999px;padding:0 .38rem;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.14);font-size:.68rem;font-weight:950;line-height:1;color:inherit}\n    .vendor-orders-table-wrap{max-height:min(68vh,760px);overflow-y:auto;overflow-x:hidden;scrollbar-gutter:stable}\n    .vendor-orders-table-wrap .vendor-responsive-table thead{position:sticky;top:0;z-index:12;background:#0f172a;box-shadow:0 2px 0 rgba(255,255,255,.08),0 8px 18px rgba(2,6,23,.22)}\n    .vendor-orders-table-wrap .vendor-responsive-table thead th{background:#0f172a;color:#cbd5e1}\n    .light body{background:#eef2f7!important;color:#172033!important}\n    .light .glass{background:#fff!important;border-color:#cbd5e1!important;box-shadow:0 12px 32px rgba(15,23,42,.08)!important}\n    .light #dashboardView>header{background:rgba(255,255,255,.96)!important;border-color:#cbd5e1!important;box-shadow:0 4px 18px rgba(15,23,42,.07)}\n    .light .vendor-text{color:#172033!important}.light .vendor-muted{color:#526176!important}\n    .light .field{background:#fff!important;color:#172033!important;border-color:#aebdce!important}.light .field::placeholder{color:#718096!important}\n    .light .vendor-main-tab,.light .vendor-order-filter{background:#f8fafc!important;border-color:#b9c6d5!important;color:#334155!important;box-shadow:none}\n    .light .vendor-main-tab:hover,.light .vendor-order-filter:hover{background:#edf4fb!important;border-color:#8da2b8!important}\n    .light .vendor-main-tab.active,.light .vendor-order-filter.active{background:#1d4ed8!important;border-color:#1d4ed8!important;color:#fff!important;box-shadow:0 5px 14px rgba(29,78,216,.18)}\n    .light .vendor-order-filter.active .vendor-order-count{background:rgba(255,255,255,.2);border-color:rgba(255,255,255,.32);color:#fff}\n    .light .vendor-order-filter:not(.active) .vendor-order-count{background:#e2e8f0;border-color:#cbd5e1;color:#243247}\n    .light .vendor-responsive-table thead,.light .vendor-compact-table thead{color:#334155!important}\n    .light .vendor-orders-table-wrap .vendor-responsive-table thead,.light .vendor-orders-table-wrap .vendor-responsive-table thead th{background:#e7edf4!important;color:#26364a!important}\n    .light .vendor-responsive-table tr,.light .vendor-compact-table tr{border-color:#d7e0ea!important}\n    .light .vendor-responsive-table td,.light .vendor-compact-table td{color:#26364a}\n    .light button.border-white\\/10,.light button.bg-white\\/5{border-color:#b9c6d5!important;background:#f8fafc!important;color:#26364a!important}\n    @media(max-width:900px){.vendor-orders-table-wrap{max-height:none;overflow:visible}.vendor-orders-table-wrap .vendor-responsive-table thead{position:static}.light .vendor-responsive-table tr{background:#fff!important;border-color:#cbd5e1!important}.light .vendor-responsive-table td{border-color:#e2e8f0!important}.light .vendor-responsive-table td::before{color:#526176!important}}\n'''
needle='  </style>'
if 'V35 FINAL UX' not in s:
    s=s.replace(needle,css+needle,1)

s=s.replace('<div class="vendor-table-wrap"><table class="vendor-responsive-table text-sm"><colgroup><col style="width:9%">','<div class="vendor-table-wrap vendor-orders-table-wrap"><table class="vendor-responsive-table text-sm"><colgroup><col style="width:9%">',1)

repls={
'>الكل</button>':'>الكل <span class="vendor-order-count" data-order-count="all">0</span></button>',
'>بانتظار الموافقة</button>':'>بانتظار الموافقة <span class="vendor-order-count" data-order-count="pending">0</span></button>',
'>قيد التوصيل</button>':'>قيد التوصيل <span class="vendor-order-count" data-order-count="delivery">0</span></button>',
'>تم التسليم</button>':'>تم التسليم <span class="vendor-order-count" data-order-count="delivered">0</span></button>',
'>المرتجعات</button>':'>المرتجعات <span class="vendor-order-count" data-order-count="returns">0</span></button>',
}
# Scope replacements to first order-filter occurrence only; finance labels are different except all.
start=s.find('<div class="vendor-order-filters" aria-label="فلترة الطلبات">')
end=s.find('</div>',start)
if start!=-1 and end!=-1:
    block=s[start:end+6]
    if 'data-order-count=' not in block:
        for a,b in repls.items(): block=block.replace(a,b,1)
        s=s[:start]+block+s[end+6:]

old="function setVendorOrderFilter(filter){activeVendorOrderFilter=filter||'all';document.querySelectorAll('[data-order-filter]').forEach(btn=>btn.classList.toggle('active',btn.dataset.orderFilter===activeVendorOrderFilter));renderVendorOrders()}"
new="function setVendorOrderFilter(filter){activeVendorOrderFilter=filter||'all';document.querySelectorAll('[data-order-filter]').forEach(btn=>btn.classList.toggle('active',btn.dataset.orderFilter===activeVendorOrderFilter));renderVendorOrders()}\nfunction updateVendorOrderCounters(){const keys=['all','pending','delivery','delivered','returns'];keys.forEach(key=>{const el=document.querySelector(`[data-order-count=\"${key}\"]`);if(!el)return;const n=key==='all'?orders.length:orders.reduce((sum,o)=>{const prev=activeVendorOrderFilter;activeVendorOrderFilter=key;const hit=vendorOrderMatchesFilter(o);activeVendorOrderFilter=prev;return sum+(hit?1:0)},0);el.textContent=String(n);el.setAttribute('aria-label',`${n} طلب`)})}"
if 'function updateVendorOrderCounters()' not in s:
    if old not in s: raise SystemExit('setVendorOrderFilter anchor missing')
    s=s.replace(old,new,1)

old_render="function renderVendorOrders(){const body=$('ordersBody');if(!body)return;const visible=orders.filter(vendorOrderMatchesFilter);"
new_render="function renderVendorOrders(){const body=$('ordersBody');if(!body)return;updateVendorOrderCounters();const visible=orders.filter(vendorOrderMatchesFilter);"
if old_render in s:s=s.replace(old_render,new_render,1)
elif new_render not in s:raise SystemExit('renderVendorOrders anchor missing')

p.write_text(s,encoding='utf-8')
print('vendor V35 final UX patch applied')
