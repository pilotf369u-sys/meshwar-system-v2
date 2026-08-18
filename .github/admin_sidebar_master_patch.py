from pathlib import Path
import re

FILES=['admin-dashboard.html','admin-branches.html','admin-branch-reports.html']

MASTER_STYLE=r'''<style id="admin-master-sidebar-v2">
:root{--admin-gold:#f6c85f;--admin-gold-deep:#d7a62e;--admin-navy:#07111f;--admin-navy-2:#0b1b2e}
.sidebar{height:100vh!important;max-height:100vh!important;overflow-y:auto!important;overflow-x:hidden!important;scrollbar-gutter:stable;top:0!important;right:0!important;left:auto!important;background:linear-gradient(180deg,rgba(9,25,43,.985),rgba(4,12,23,.99))!important;border-left:1px solid rgba(246,200,95,.24)!important;box-shadow:-16px 0 48px rgba(0,0,0,.30)!important;padding:18px 14px 30px!important;overscroll-behavior:contain}
.sidebar h2{color:#fff!important;text-shadow:0 0 24px rgba(246,200,95,.16)!important;margin:4px 0 20px!important}
.sidebar a{display:block!important;background:rgba(29,53,79,.76)!important;border:1px solid rgba(148,163,184,.11)!important;border-radius:11px!important;color:#e7eef8!important;padding:10px 12px!important;margin:6px 0!important;text-decoration:none!important;cursor:pointer!important;transition:transform .18s ease,box-shadow .18s ease,background .18s ease!important}
.sidebar a:hover{transform:translateX(-2px)!important;background:rgba(38,67,98,.94)!important;border-color:rgba(246,200,95,.28)!important}
.sidebar a.active{background:linear-gradient(135deg,#fff0b7 0%,#f6c85f 58%,#d7a62e 100%)!important;color:#17130a!important;border-color:#ffe69a!important;box-shadow:0 0 0 1px rgba(255,230,154,.30),0 9px 26px rgba(215,166,46,.25)!important;font-weight:900!important}
.sidebar a.logout-link{background:linear-gradient(135deg,#d34840,#9f2926)!important;color:#fff!important;border-color:rgba(255,255,255,.10)!important;margin-top:18px!important;margin-bottom:8px!important}
.sidebar::-webkit-scrollbar{width:8px}.sidebar::-webkit-scrollbar-track{background:rgba(255,255,255,.035);border-radius:999px}.sidebar::-webkit-scrollbar-thumb{background:linear-gradient(#f6c85f,#9b7624);border-radius:999px;border:2px solid #081523}
@media(max-width:900px){.sidebar{position:static!important;width:100%!important;height:auto!important;max-height:none!important;overflow:visible!important;border-left:0!important;border-bottom:1px solid rgba(246,200,95,.24)!important}.main,.main-content{margin-right:0!important;width:100%!important}}
</style>'''

ITEMS=[
('section','orders','إدارة الطلبات'),('section','pricing','إدارة التسعير والشحن'),('section','whatsapp','إشعارات الواتساب'),('section','employees','إدارة الموظفين'),('section','delivery','إدارة المندوبين'),
('page','admin-delivery-reports.html','تقرير ومتابعة المندوبين'),('page','admin-branches.html','إدارة الفروع والمخازن'),('page','admin-branch-reports.html','تقرير ومتابعة الفروع'),
('section','vendor-finance','💰 الحسابات والتقارير المالية'),('page','local-stores-admin.html','🏪 إدارة المتاجر المحلية'),('section','exchange','أسعار صرف العملات'),('section','stores','إدارة المتاجر'),('section','customers','إدارة العملاء'),('section','content','إدارة المحتوى')]

def sidebar(page):
    out=['<div class="sidebar admin-master-sidebar"><h2>لوحة الإدارة</h2>']
    for kind,target,label in ITEMS:
        active=(page=='admin-branches.html' and target=='admin-branches.html') or (page=='admin-branch-reports.html' and target=='admin-branch-reports.html')
        cls=' class="active"' if active else ''
        if page=='admin-dashboard.html' and kind=='section':
            out.append(f'<a{cls} href="#" data-admin-section="{target}" onclick="showAdminMasterSection(\'{target}\');return false">{label}</a>')
        elif kind=='section':
            out.append(f'<a{cls} data-admin-section="{target}" href="admin-dashboard.html">{label}</a>')
        else:
            out.append(f'<a{cls} data-admin-page="{target}" data-preserve-admin href="{target}">{label}</a>')
    out.append('<a href="login.html" class="logout-link">تسجيل الخروج</a></div>')
    return ''.join(out)

def inject_style(s):
    # Remove a previous trial marker wherever it landed, then inject into the document's real first </head>.
    s=re.sub(r'<style id="admin-master-sidebar-v2">[\s\S]*?</style>','',s,count=1)
    pos=s.lower().find('</head>')
    if pos<0: raise SystemExit('missing real </head>')
    return s[:pos]+MASTER_STYLE+s[pos:]

def replace_sidebar(s,page,main_class):
    pat=rf'<div class="sidebar(?: [^"]*)?">[\s\S]*?</div>\s*<div class="{re.escape(main_class)}">'
    repl=sidebar(page)+f'\n<div class="{main_class}">'
    ns,n=re.subn(pat,repl,s,count=1)
    if n!=1: raise SystemExit(f'sidebar replace failed: {page} {n}')
    return ns

def patch_dashboard(s):
    s=replace_sidebar(s,'admin-dashboard.html','main-content')
    s=inject_style(s)
    nav=r'''<script id="admin-master-sidebar-nav-v2">
function setAdminMasterActive(sectionId){document.querySelectorAll('.sidebar a[data-admin-section]').forEach(a=>a.classList.toggle('active',a.dataset.adminSection===sectionId))}
function showAdminMasterSection(sectionId){showSection(sectionId);setAdminMasterActive(sectionId);if(sectionId==='vendor-finance'&&typeof loadAdminVendorFinance==='function')loadAdminVendorFinance()}
window.addEventListener('load',()=>{const requested=new URLSearchParams(location.search).get('section');if(requested&&document.getElementById(requested)){showAdminMasterSection(requested)}else{setAdminMasterActive(document.querySelector('.card.active-section')?.id||'orders')}});
</script>'''
    s=re.sub(r'<script id="admin-master-sidebar-nav-v2">[\s\S]*?</script>','',s,count=1)
    pos=s.lower().rfind('</body>')
    if pos<0: raise SystemExit('dashboard missing body close')
    return s[:pos]+nav+s[pos:]

def patch_secondary(s,page):
    s=replace_sidebar(s,page,'main')
    s=inject_style(s)
    old_re=r"function updateLinks\(\)\{[\s\S]*?\}async function authAdmin\(\)"
    new="function updateLinks(){const id=encodeURIComponent(cloudId(currentAdmin.id)),q='adminId='+id;document.querySelectorAll('[data-admin-section]').forEach(a=>{a.href='admin-dashboard.html?'+q+'&section='+encodeURIComponent(a.dataset.adminSection)});document.querySelectorAll('[data-admin-page]').forEach(a=>{a.href=a.dataset.adminPage+'?'+q})}async function authAdmin()"
    s,n=re.subn(old_re,new,s,count=1)
    if n!=1: raise SystemExit(f'updateLinks patch failed {page}: {n}')
    return s

for f in FILES:
    p=Path(f);s=p.read_text(encoding='utf-8')
    if f=='admin-dashboard.html': s=patch_dashboard(s)
    else: s=patch_secondary(s,f)
    p.write_text(s,encoding='utf-8')
