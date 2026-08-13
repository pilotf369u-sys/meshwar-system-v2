from pathlib import Path
import re
p=Path('index.html'); s=p.read_text(encoding='utf-8'); old=s
old_ids=set(re.findall(r'\bid=["\']([^"\']+)["\']',old,re.I))
legacy=re.search(r'<script>\s*const MAIN_SUPABASE_URL.*?window\.logout = logout;\s*</script>',old,re.S)
local=re.search(r'<script type="module">\s*/\* LOCAL_STORES_PUBLIC_DATA_V1 \*/.*?</script>',old,re.S)
if not legacy or not local: raise SystemExit('critical scripts missing')
legacy_text,local_text=legacy.group(0),local.group(0)
s=s.replace('grid-cols-2 gap-3 px-4 sm:!grid-cols-3 lg:!grid-cols-4 xl:!grid-cols-5','grid-cols-2 gap-4 px-4 md:!grid-cols-4 lg:!grid-cols-6',1)
s=s.replace('min-h-52','min-h-40',1).replace('!h-20 rounded-xl','!h-14 rounded-xl',1)
if 'meshwarStoreTabs' not in s:
 m='    <section id="localStoresPublic" class="local-stores-shell" data-store-tab="local">'
 if m not in s: m='    <section id="localStoresPublic" class="local-stores-shell">'
 tabs='''    <section id="meshwarStoreTabs" class="mx-auto mt-8 max-w-7xl px-4"><div class="flex flex-wrap gap-3 rounded-2xl border border-amber-400/20 bg-slate-900/60 p-2 backdrop-blur-md"><button id="showInternationalStoresBtn" type="button" class="rounded-xl border border-amber-400/40 bg-gradient-to-r from-sky-600 to-indigo-600 px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-amber-400/10">🌐 المتاجر العالمية</button><button id="showLocalStoresBtn" type="button" class="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-black text-slate-200">🏪 المتاجر المحلية</button></div></section>\n\n'''
 if m not in s: raise SystemExit('local marker missing')
 s=s.replace(m,tabs+m,1)
if 'internationalStoresSection' not in s:
 a='    <h2 class="section-title">المتاجر الشاملة</h2>'; b='    <h2 class="section-title">المتاجر الشخصية والمحلية</h2>'
 i,j=s.find(a),s.find(b)
 if i<0 or j<0 or j<=i: raise SystemExit('international bounds missing')
 s=s[:i]+'    <section id="internationalStoresSection">\n'+s[i:j]+'    </section>\n\n'+s[j:]
if 'meshwarVideoAd' not in s:
 mark='</div></div></section>\n\n    <button class="fixed-order-btn"'
 video='''</div></div><div id="meshwarVideoAd" class="mx-auto mt-4 max-w-7xl px-4"><div class="grid gap-4 rounded-3xl border border-amber-400/20 bg-slate-900/60 p-4 shadow-xl shadow-amber-400/5 backdrop-blur-md md:grid-cols-[1.2fr_.8fr]"><div class="overflow-hidden rounded-2xl border border-white/10 bg-black/40"><video id="meshwarPromoVideo" class="aspect-video h-full w-full object-cover" autoplay muted loop playsinline preload="metadata"><source src="videos/promo.mp4" type="video/mp4"></video></div><div class="flex flex-col justify-center rounded-2xl border border-white/10 bg-slate-950/40 p-5"><div class="text-xs font-black text-amber-300">MeshWar Showcase</div><h3 class="mt-2 text-xl font-black text-white">مساحة العروض والإعلانات المرئية</h3><p class="mt-2 text-sm leading-7 text-slate-300">فيديوهات قصيرة للعروض والمتاجر الجديدة مع تشغيل تلقائي صامت ومتجاوب.</p><div class="mt-4 flex flex-wrap gap-2"><button id="meshwarPromoSoundBtn" type="button" class="rounded-xl border border-amber-400/40 bg-white/5 px-4 py-2 text-sm font-black text-white">🔇 تشغيل الصوت</button><button id="meshwarPromoPlayBtn" type="button" class="rounded-xl border border-white/10 bg-gradient-to-r from-sky-600 to-indigo-600 px-4 py-2 text-sm font-black text-white">⏯ تشغيل / إيقاف</button></div></div></div></div></section>\n\n    <button class="fixed-order-btn"'''
 if mark not in s: raise SystemExit('hero marker missing')
 s=s.replace(mark,video,1)
css='''\n<style>/* MESHWAR_COMPACT_SHOWCASE_V5 */.local-stores-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:12px!important}.local-public-card{min-height:158px!important;padding:12px!important;border-radius:16px!important}.local-public-logo{width:52px!important;height:52px!important;margin-bottom:7px!important}.local-public-name{font-size:14px!important}.local-public-meta{font-size:11px!important}.local-public-chip{font-size:10px!important;padding-top:7px!important}.local-store-open{margin-top:8px!important;padding:7px 10px!important;font-size:10px!important}@media(min-width:768px){.local-stores-grid{grid-template-columns:repeat(4,minmax(0,1fr))!important}}@media(min-width:1024px){.local-stores-grid{grid-template-columns:repeat(6,minmax(0,1fr))!important}}</style>\n'''
if 'MESHWAR_COMPACT_SHOWCASE_V5' not in s: s=s.replace('</head>',css+'</head>',1)
ui='''\n<script>/* MESHWAR_COMPACT_SHOWCASE_UI_V5 */(function(){const intl=document.getElementById('internationalStoresSection'),loc=document.getElementById('localStoresPublic'),bi=document.getElementById('showInternationalStoresBtn'),bl=document.getElementById('showLocalStoresBtn');function show(k){if(intl)intl.style.display=k==='international'?'':'none';if(loc)loc.style.display=k==='local'?'':'none'}bi?.addEventListener('click',()=>show('international'));bl?.addEventListener('click',()=>show('local'));show('international');const v=document.getElementById('meshwarPromoVideo'),sb=document.getElementById('meshwarPromoSoundBtn'),pb=document.getElementById('meshwarPromoPlayBtn');sb?.addEventListener('click',()=>{if(!v)return;v.muted=!v.muted;sb.textContent=v.muted?'🔇 تشغيل الصوت':'🔊 كتم الصوت'});pb?.addEventListener('click',()=>{if(!v)return;v.paused?v.play().catch(()=>{}):v.pause()})})();</script>\n'''
if 'MESHWAR_COMPACT_SHOWCASE_UI_V5' not in s: s=s.replace('</body>',ui+'</body>',1)
new_ids=set(re.findall(r'\bid=["\']([^"\']+)["\']',s,re.I)); missing=old_ids-new_ids
if missing: raise SystemExit('missing ids: '+','.join(sorted(missing)))
if legacy_text not in s: raise SystemExit('legacy script changed')
if local_text not in s: raise SystemExit('local script changed')
if 'grid-template-columns:repeat(6' not in s or 'meshwarPromoVideo' not in s or 'showLocalStoresBtn' not in s: raise SystemExit('markers missing')
p.write_text(s,encoding='utf-8')
