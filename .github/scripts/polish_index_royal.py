from pathlib import Path
import re

p = Path('index.html')
s = p.read_text(encoding='utf-8')
old = s

legacy_match = re.search(r"<script>\s*const MAIN_SUPABASE_URL.*?window\.logout = logout;\s*</script>", old, re.S)
if not legacy_match:
    raise SystemExit('legacy order script not found')
legacy_script = legacy_match.group(0)
old_ids = set(re.findall(r'\bid=["\']([^"\']+)["\']', old, re.I))

# 1) Royal logo + hero / tracking accents.
s = s.replace(
    '<img src="images/meshwar-logo.png" class="h-11 w-11 rounded-xl border border-white/10 bg-white/5 p-1" alt="MeshWar">',
    '<img src="images/meshwar-logo.png" class="h-12 w-12 rounded-xl border border-amber-400/40 bg-white/5 p-1 shadow-lg shadow-amber-400/10" alt="MeshWar">',
    1
)
s = s.replace(
    'class="rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 px-5 py-3 font-black text-white shadow-lg transition-all duration-300 hover:scale-[1.02] hover:shadow-cyan-500/20">طلب منتج مباشر</button>',
    'class="rounded-xl border border-amber-400/50 bg-gradient-to-r from-sky-600 to-indigo-600 px-5 py-3 font-black text-white shadow-lg shadow-amber-400/10 transition-all duration-300 hover:scale-[1.02] hover:border-amber-300 hover:shadow-amber-400/20">طلب منتج مباشر</button>',
    1
)
s = s.replace(
    '<div class="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 dark:border-white/10 dark:bg-slate-950/50"><div class="text-sm font-black">تتبع سريع للطلب</div><div class="mt-1 text-xs text-slate-500 dark:text-slate-400">أدخل رقم الطلب أو الباركود.</div><div class="mt-4 flex gap-2"><input id="meshwarHeroTrackInput" class="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-3 outline-none focus:border-sky-400 dark:border-white/10 dark:bg-slate-900" placeholder="MW / رقم الطلب / الباركود"><button id="meshwarHeroTrackBtn" type="button" onclick="meshwarQuickTrack()" class="rounded-xl bg-sky-600 px-4 font-black text-white">تتبع</button></div></div>',
    '<div class="rounded-2xl border border-amber-400/20 bg-slate-900/80 p-5 shadow-lg shadow-amber-400/5 backdrop-blur-md"><div class="text-sm font-black text-slate-100">تتبع سريع للطلب</div><div class="mt-1 text-xs text-slate-300">أدخل رقم الطلب أو الباركود.</div><div class="mt-4 flex gap-2"><input id="meshwarHeroTrackInput" class="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-800 px-3 py-3 text-slate-100 placeholder:text-slate-400 outline-none focus:border-amber-400/60 focus:ring-2 focus:ring-amber-400/10" placeholder="MW / رقم الطلب / الباركود"><button id="meshwarHeroTrackBtn" type="button" onclick="meshwarQuickTrack()" class="rounded-xl border border-amber-400/50 bg-gradient-to-r from-sky-600 to-indigo-600 px-4 font-black text-white shadow-md shadow-amber-400/10 transition hover:border-amber-300">تتبع</button></div></div>',
    1
)

# 2) Glassmorphic dark order modal. IDs and submitOrder() remain unchanged.
modal_pattern = re.compile(r'''\n    <div id="orderModal".*?\n    </div>\n\n    <script>''', re.S)
modal = '''
    <div id="orderModal" class="fixed inset-0 z-[12000] hidden overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-md" style="display:none;">
        <div class="mx-auto my-8 w-full max-w-md rounded-3xl border border-amber-400/25 bg-slate-900/90 p-5 text-right text-slate-100 shadow-2xl shadow-amber-400/10 backdrop-blur-xl" dir="rtl">
            <div class="mb-4 flex items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div><div class="text-xs font-bold text-amber-300">MeshWar Order</div><h3 class="mt-1 text-xl font-black text-white">إرسال تفاصيل الطلب</h3></div>
                <img src="images/meshwar-logo.png" alt="MeshWar Logo" class="h-12 w-12 rounded-xl border border-amber-400/30 bg-white/5 object-contain p-1 shadow-lg shadow-amber-400/10">
            </div>
            <div class="space-y-4">
                <label class="block"><span class="mb-1.5 block text-sm font-bold text-slate-200">رابط المنتج</span><input type="text" id="pUrl" placeholder="الصق الرابط هنا" class="w-full box-border rounded-xl border border-white/10 bg-slate-800 px-3 py-3 text-white placeholder:text-slate-400 outline-none transition focus:border-amber-400/60 focus:ring-2 focus:ring-amber-400/10"></label>
                <div class="grid grid-cols-2 gap-3">
                    <label class="block"><span class="mb-1.5 block text-sm font-bold text-slate-200">اللون</span><input type="text" id="pColor" placeholder="مثلاً: أسود" class="w-full box-border rounded-xl border border-white/10 bg-slate-800 px-3 py-3 text-white placeholder:text-slate-400 outline-none transition focus:border-amber-400/60"></label>
                    <label class="block"><span class="mb-1.5 block text-sm font-bold text-slate-200">المقاس</span><input type="text" id="pSize" placeholder="مثلاً: XL" class="w-full box-border rounded-xl border border-white/10 bg-slate-800 px-3 py-3 text-white placeholder:text-slate-400 outline-none transition focus:border-amber-400/60"></label>
                </div>
                <label class="block"><span class="mb-1.5 block text-sm font-bold text-slate-200">العدد</span><input type="number" id="pQuantity" value="1" min="1" class="w-full box-border rounded-xl border border-white/10 bg-slate-800 px-3 py-3 text-white outline-none transition focus:border-amber-400/60"></label>
                <button id="mainOrderSubmitBtn" onclick="submitOrder()" class="w-full rounded-xl border border-amber-400/50 bg-gradient-to-r from-sky-600 to-indigo-600 px-4 py-3 font-black text-white shadow-lg shadow-amber-400/10 transition-all duration-300 hover:scale-[1.01] hover:border-amber-300 hover:shadow-amber-400/20">إرسال للواتساب</button>
                <button onclick="document.getElementById('orderModal').style.display='none'" class="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-bold text-slate-300 transition hover:border-amber-400/30 hover:text-white">إغلاق</button>
            </div>
        </div>
    </div>

    <script>'''
s, n = modal_pattern.subn(modal, s, count=1)
if n != 1:
    raise SystemExit('order modal replacement failed')

# 3) Responsive local stores grid + gold neon accents.
extra_css = '''
/* MESHWAR_ROYAL_GOLD_V4 */
.local-stores-grid{grid-template-columns:repeat(1,minmax(0,1fr))!important;gap:16px!important}
.local-public-card{min-width:0!important;border-color:rgba(251,191,36,.22)!important;box-shadow:0 14px 40px rgba(2,6,23,.22),inset 0 1px rgba(255,255,255,.04)!important}
.local-public-card:hover{border-color:rgba(251,191,36,.55)!important;box-shadow:0 18px 48px rgba(251,191,36,.10),0 0 0 1px rgba(56,189,248,.10)!important}
.local-public-logo{border-color:rgba(251,191,36,.40)!important;box-shadow:0 8px 25px rgba(251,191,36,.08)!important}
.local-public-open{display:inline-flex;align-items:center;justify-content:center;gap:7px;width:100%;margin-top:13px;padding:9px 12px;border-radius:12px;border:1px solid rgba(251,191,36,.48);background:linear-gradient(90deg,rgba(2,132,199,.30),rgba(79,70,229,.30));color:#f8fafc;text-decoration:none;font-size:12px;font-weight:900;transition:.25s;box-sizing:border-box}
.local-public-open:hover{transform:translateY(-2px);border-color:#fbbf24;box-shadow:0 10px 30px rgba(251,191,36,.12)}
.local-public-location{display:flex;align-items:center;justify-content:center;gap:5px;margin-top:5px;color:#cbd5e1;font-size:12px}
.header-container,.store-card,.local-stores-shell{box-shadow:0 18px 50px rgba(2,6,23,.18),0 0 0 1px rgba(251,191,36,.04)!important}
.store-link,.fixed-order-btn,.account-btn{border:1px solid rgba(251,191,36,.35)!important}
@media(min-width:640px){.local-stores-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
@media(min-width:768px){.local-stores-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}}
@media(min-width:1280px){.local-stores-grid{grid-template-columns:repeat(4,minmax(0,1fr))!important}}
'''
if 'MESHWAR_ROYAL_GOLD_V4' not in s:
    s = s.replace('</style>\n</head>', extra_css + '\n</style>\n</head>', 1)

# 4) Local store cards: logo/name/specialty/location + open-store button without inventing a missing page.
old_render = re.search(r'function renderLocalPublicStores\(\)\{.*?\}\nfunction renderLocalSpecialtyFilters', s, re.S)
if not old_render:
    raise SystemExit('local store renderer not found')
new_render = '''function localCountryFlag(country){const x=String(country||'').trim().toLowerCase();const m={'العراق':'🇮🇶','iraq':'🇮🇶','تركيا':'🇹🇷','turkey':'🇹🇷','türkiye':'🇹🇷','سوريا':'🇸🇾','syria':'🇸🇾','السعودية':'🇸🇦','saudi arabia':'🇸🇦','الإمارات':'🇦🇪','uae':'🇦🇪','الأردن':'🇯🇴','jordan':'🇯🇴'};return m[x]||'📍'}
function renderLocalPublicStores(){const grid=document.getElementById('localStoresPublicGrid');if(!grid)return;const focus=new URLSearchParams(location.search).get('storeId');const rows=localPublicStores.filter(s=>(!focus||String(s.id)===String(focus))&&(localActiveSpecialty==='الكل'||String(s.specialty||'شامل')===localActiveSpecialty));grid.innerHTML=rows.map(s=>`<article class="local-public-card"><img class="local-public-logo" src="${localEsc(s.logo_url||localPlaceholder)}" onerror="this.onerror=null;this.src='${localEsc(localPlaceholder)}'" alt="${localEsc(s.store_name||'متجر')}"><div class="local-public-name">${localEsc(s.store_name||'متجر محلي')}</div><div class="local-public-meta">${localEsc(s.specialty||s.store_type||'شامل')}</div><div class="local-public-location"><span>${localCountryFlag(s.country)}</span><span>${localEsc(s.governorate||s.country||'غير محدد')}</span></div><div class="local-public-chip">${localEsc(s.default_currency||'')} · متجر نشط</div><a class="local-public-open" href="index.html?storeId=${encodeURIComponent(String(s.id||''))}#localStoresPublic">✨ فتح المتجر</a></article>`).join('')||'<div class="local-empty">لا توجد متاجر ضمن هذا التخصص حالياً.</div>'}
function renderLocalSpecialtyFilters'''
s = s[:old_render.start()] + new_render + s[old_render.end():]

# 5) Quick tracking bridge: call legacy trackOrder first when available.
ui_pattern = re.compile(r"function meshwarQuickTrack\(\)\{.*?\}\s*</script>", re.S)
ui_match = ui_pattern.search(s)
if not ui_match:
    raise SystemExit('quick track function not found')
quick = '''function meshwarQuickTrack(){const a=document.getElementById('meshwarHeroTrackInput'),v=String(a?.value||'').trim();if(!v)return a?.focus();const x=[...document.querySelectorAll('input')].find(e=>e!==a&&/track|order|barcode|shipment|code|تتبع|طلب|باركود|شحنة/i.test([e.id,e.name,e.placeholder].filter(Boolean).join(' ')));if(x){x.value=v;x.dispatchEvent(new Event('input',{bubbles:true}));}if(typeof window.trackOrder==='function')return window.trackOrder(v);if(typeof window.trackShipment==='function')return window.trackShipment(v);const b=[...document.querySelectorAll('button,a')].find(e=>e.id!=='meshwarHeroTrackBtn'&&/تتبع|track/i.test(e.textContent||''));if(b){b.scrollIntoView({behavior:'smooth',block:'center'});if(b.tagName==='BUTTON')setTimeout(()=>b.click(),300)}}</script>'''
s = s[:ui_match.start()] + quick + s[ui_match.end():]

# Validation: legacy order code untouched; all pre-existing IDs still exist.
new_legacy = re.search(r"<script>\s*const MAIN_SUPABASE_URL.*?window\.logout = logout;\s*</script>", s, re.S)
if not new_legacy or new_legacy.group(0) != legacy_script:
    raise SystemExit('legacy order script changed')
new_ids = set(re.findall(r'\bid=["\']([^"\']+)["\']', s, re.I))
missing = sorted(old_ids - new_ids)
if missing:
    raise SystemExit('missing legacy ids: ' + ','.join(missing))
for token in ['orderModal','pUrl','pColor','pSize','pQuantity','mainOrderSubmitBtn','localStoresPublicGrid','localSpecialtyFilters','meshwarHeroTrackInput','meshwarHeroTrackBtn','LOCAL_STORES_PUBLIC_DATA_V1']:
    if token not in s:
        raise SystemExit('critical token missing: '+token)
if '<\\/script>' in s:
    raise SystemExit('escaped closing script detected')

p.write_text(s, encoding='utf-8')
print('Royal index polish validated')
