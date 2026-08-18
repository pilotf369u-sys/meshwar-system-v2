from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def read(p): return (ROOT/p).read_text(encoding='utf-8')
def write(p,s): (ROOT/p).write_text(s,encoding='utf-8')
def must_replace(text,old,new,label,count=1):
    n=text.count(old)
    if n < count: raise RuntimeError(f'{label}: expected >= {count}, found {n}')
    return text.replace(old,new,count)

# admin-dashboard.html
p='admin-dashboard.html'; t=read(p)
repls=[
('<a data-admin-page="admin-delivery-reports.html" data-preserve-admin href="admin-delivery-reports.html">تقرير ومتابعة المندوبين</a>','<a href="#" data-admin-section="courier-reports" onclick="showAdminMasterSection(\'courier-reports\');return false">تقرير ومتابعة المندوبين</a>'),
('<a data-admin-page="admin-branch-reports.html" data-preserve-admin href="admin-branch-reports.html">تقرير ومتابعة الفروع</a>','<a href="#" data-admin-section="branch-reports" onclick="showAdminMasterSection(\'branch-reports\');return false">تقرير ومتابعة الفروع</a>'),
('<a data-admin-page="local-stores-admin.html" data-preserve-admin href="local-stores-admin.html">🏪 إدارة المتاجر المحلية</a>','<a href="#" data-admin-section="local-stores" onclick="showAdminMasterSection(\'local-stores\');return false">🏪 إدارة المتاجر المحلية</a>'),
]
for old,new in repls: t=must_replace(t,old,new,'sidebar integration')

marker='<div class="card" id="exchange"><h3>أسعار الصرف — Supabase</h3>'
insert='''<div class="card admin-embedded-card" id="courier-reports"><h3>تقارير ومحاسبة المندوبين</h3><div class="mini">تقرير المندوبين داخل لوحة الإدارة الموحدة.</div><iframe id="courierReportsFrame" title="تقارير ومحاسبة المندوبين" class="admin-embedded-frame" loading="lazy"></iframe></div>\n<div class="card admin-embedded-card" id="branch-reports"><h3>تقرير ومتابعة الفروع</h3><div class="mini">كشف الحساب اللوجستي والتقفيلات داخل لوحة الإدارة الموحدة.</div><iframe id="branchReportsFrame" title="تقرير ومتابعة الفروع" class="admin-embedded-frame" loading="lazy"></iframe></div>\n'''
t=must_replace(t,marker,insert+marker,'embedded report cards')

t=must_replace(t,"const target='local-stores-admin.html'+(adminId?'?adminId='+encodeURIComponent(adminId):'');","const target='local-stores-admin.html?embed=1'+(adminId?'&adminId='+encodeURIComponent(adminId):'');",'local stores embedded target')

css_marker='</style>\n<script id="admin-executive-nav-v1">'
css_add='''.admin-embedded-card{padding:16px!important;overflow:hidden}.admin-embedded-card>h3{margin:0 0 4px!important}.admin-embedded-frame{display:block;width:100%;height:78vh;min-height:680px;margin-top:12px;border:1px solid rgba(246,200,95,.18);border-radius:16px;background:#050d19;box-shadow:inset 0 1px rgba(255,255,255,.03)}@media(max-width:850px){.admin-embedded-frame{height:82vh;min-height:620px;border-radius:12px}}\n</style>\n<script id="admin-executive-nav-v1">'''
t=must_replace(t,css_marker,css_add,'embedded frame luxury css')

old_nav="""function setAdminMasterActive(sectionId){document.querySelectorAll('.sidebar a[data-admin-section]').forEach(a=>a.classList.toggle('active',a.dataset.adminSection===sectionId))}\nasync function showAdminMasterSection(sectionId){showSection(sectionId);setAdminMasterActive(sectionId);if(sectionId==='vendor-finance'&&typeof loadAdminVendorFinance==='function')await loadAdminVendorFinance()}\nwindow.addEventListener('load',()=>{const requested=new URLSearchParams(location.search).get('section');if(requested&&document.getElementById(requested)){showAdminMasterSection(requested)}else{setAdminMasterActive(document.querySelector('.card.active-section')?.id||'orders')}});"""
new_nav="""const ADMIN_EMBEDDED_SECTIONS={\n  'courier-reports':{frame:'courierReportsFrame',page:'admin-delivery-reports.html'},\n  'branch-reports':{frame:'branchReportsFrame',page:'admin-branch-reports.html'},\n  'local-stores':{frame:'localStoresFrame',page:'local-stores-admin.html'}\n};\nfunction setAdminMasterActive(sectionId){document.querySelectorAll('.sidebar a[data-admin-section]').forEach(a=>a.classList.toggle('active',a.dataset.adminSection===sectionId))}\nfunction ensureAdminEmbeddedSection(sectionId){const cfg=ADMIN_EMBEDDED_SECTIONS[sectionId];if(!cfg)return;const frame=document.getElementById(cfg.frame);if(!frame||frame.getAttribute('src'))return;const adminId=String(currentAdminCloud?.id||getAdminId?.()||'').trim(),u=new URL(cfg.page,location.href);u.searchParams.set('embed','1');if(adminId)u.searchParams.set('adminId',adminId);frame.src=u.pathname.split('/').pop()+u.search}\nasync function showAdminMasterSection(sectionId){showSection(sectionId);setAdminMasterActive(sectionId);const u=new URL(location.href);u.searchParams.set('section',sectionId);history.replaceState(null,'',u.pathname+u.search+u.hash);ensureAdminEmbeddedSection(sectionId);if(sectionId==='vendor-finance'&&typeof loadAdminVendorFinance==='function')await loadAdminVendorFinance()}\nwindow.addEventListener('load',()=>{const requested=new URLSearchParams(location.search).get('section');if(requested&&document.getElementById(requested)){showAdminMasterSection(requested)}else{setAdminMasterActive(document.querySelector('.card.active-section')?.id||'orders')}});"""
t=must_replace(t,old_nav,new_nav,'master navigation integration')
write(p,t)

# Courier reports embedded luxury mode
p='admin-delivery-reports.html'; t=read(p)
head_marker='<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>تقارير ومحاسبة المندوبين - MeshWar</title>'
t=must_replace(t,head_marker,head_marker+'\n<script>if(new URLSearchParams(location.search).get(\'embed\')===\'1\')document.documentElement.classList.add(\'admin-embedded\')</script>','courier embed class')
style_end='</style>\n</head>'
embed_css='''\nhtml.admin-embedded{background:transparent;color-scheme:dark}html.admin-embedded body{background:transparent;color:#e7eef8}html.admin-embedded .page{max-width:none;padding:0}html.admin-embedded .head,html.admin-embedded .filters,html.admin-embedded .card,html.admin-embedded .panel{background:linear-gradient(145deg,rgba(13,26,45,.96),rgba(6,15,28,.94));border-color:rgba(246,200,95,.20);box-shadow:none;color:#e7eef8}html.admin-embedded .head{border-radius:16px}html.admin-embedded .head h1,html.admin-embedded .panel h2,html.admin-embedded .card .value{color:#fde7a4}html.admin-embedded .muted,html.admin-embedded .small,html.admin-embedded .card .label{color:#9fb0c6}html.admin-embedded .actions{display:none}html.admin-embedded .filters select,html.admin-embedded .filters input,html.admin-embedded .settle-box,html.admin-embedded .settle-box textarea{background:#07111f;color:#f8fafc;border-color:rgba(148,163,184,.22)}html.admin-embedded table{background:rgba(4,12,23,.72)}html.admin-embedded th{background:#102139;color:#fde7a4;border-color:rgba(148,163,184,.14)}html.admin-embedded td{color:#e7eef8;border-color:rgba(148,163,184,.10)}html.admin-embedded tr.unsettled{background:rgba(180,83,9,.10)}html.admin-embedded tr.settled{background:rgba(21,128,61,.08)}\n</style>\n</head>'''
t=must_replace(t,style_end,embed_css,'courier embedded theme')
write(p,t)

# Branch reports embedded luxury mode
p='admin-branch-reports.html'; t=read(p)
head_marker='<html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>تقارير وحسابات الفروع</title>'
t=must_replace(t,head_marker,head_marker+'<script>if(new URLSearchParams(location.search).get(\'embed\')===\'1\')document.documentElement.classList.add(\'admin-embedded\')</script>','branch embed class')
body_marker='</style></head><body>'
branch_css='''</style><style id="admin-embedded-branch-theme">html.admin-embedded{background:transparent;color-scheme:dark}html.admin-embedded body{display:block!important;background:transparent!important;color:#e7eef8!important}html.admin-embedded .sidebar{display:none!important}html.admin-embedded .main{margin:0!important;width:100%!important;padding:0!important}html.admin-embedded .card,html.admin-embedded .toolbar,html.admin-embedded .sum{background:linear-gradient(145deg,rgba(13,26,45,.96),rgba(6,15,28,.94))!important;border-color:rgba(246,200,95,.20)!important;color:#e7eef8!important;box-shadow:none!important}html.admin-embedded .ok{background:rgba(5,150,105,.10)!important;border-color:rgba(52,211,153,.28)!important;color:#d1fae5!important}html.admin-embedded input,html.admin-embedded select{background:#07111f!important;color:#f8fafc!important;border-color:rgba(148,163,184,.22)!important}html.admin-embedded table{background:rgba(4,12,23,.72)!important}html.admin-embedded th{background:#102139!important;color:#fde7a4!important;border-color:rgba(148,163,184,.14)!important}html.admin-embedded td{color:#e7eef8!important;border-color:rgba(148,163,184,.10)!important}html.admin-embedded .chip{background:rgba(246,200,95,.10)!important;color:#fde7a4!important}html.admin-embedded h2,html.admin-embedded h3{color:#fde7a4!important}html.admin-embedded .muted{color:#9fb0c6!important}</style></head><body>'''
t=must_replace(t,body_marker,branch_css,'branch embedded theme')
write(p,t)

# Local stores embedded mode
p='local-stores-admin.html'; t=read(p)
head_marker='  <title>إدارة المتاجر المحلية - MeshWar</title>'
t=must_replace(t,head_marker,head_marker+'\n  <script>if(new URLSearchParams(location.search).get(\'embed\')===\'1\')document.documentElement.classList.add(\'admin-embedded\')</script>','local stores embed class')
head_end='</head>'
local_css='''<style>html.admin-embedded{background:transparent;color-scheme:dark}html.admin-embedded body{background:transparent!important}html.admin-embedded main{max-width:none!important;padding:0!important}html.admin-embedded main>div:first-child{margin-bottom:14px!important;padding:2px 2px 0}html.admin-embedded section{border-color:rgba(246,200,95,.18)!important;background:linear-gradient(145deg,rgba(13,26,45,.92),rgba(6,15,28,.88))!important}html.admin-embedded h1,html.admin-embedded h2{color:#fde7a4!important}</style>\n</head>'''
t=must_replace(t,head_end,local_css,'local stores embedded theme')
write(p,t)

print('admin master tabs integration applied')
