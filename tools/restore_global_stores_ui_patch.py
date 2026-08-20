from pathlib import Path

ADMIN = Path('admin-dashboard.html')
JS = Path('js/local-store-pricing.js')

# 1) Admin image field: make logo_url/path entry explicit and remove invalid local category
admin = ADMIN.read_text(encoding='utf-8')
old_input = '<input id="storeImg" placeholder="الصورة">'
new_input = '<input id="storeImg" type="text" dir="ltr" autocomplete="off" placeholder="رابط الشعار أو المسار المحلي: images/store.png" title="أدخل رابط https://... أو مسارًا من مجلد images/ مثل images/N11.png" style="min-width:320px">'
if old_input in admin:
    admin = admin.replace(old_input, new_input, 1)
elif new_input not in admin:
    raise SystemExit('storeImg input marker not found')
admin = admin.replace('<option value="home">منزل</option><option value="local">محلية</option>', '<option value="home">منزل</option>', 1)
ADMIN.write_text(admin, encoding='utf-8')

# 2) Public global stores: merge cloud rows with static cards instead of replacing all static cards
js = JS.read_text(encoding='utf-8')
marker = '/* MESHWAR_GLOBAL_STORES_PUBLIC_V1 */'
if marker not in js:
    raise SystemExit('global stores loader marker missing')
start = js.index(marker)
load_start = js.index('  async function load(){install();try{', start)
load_end = js.index("  if(document.readyState==='loading')", load_start)
new_load = r'''  async function load(){
    install();
    try{
      const r=await fetch(`${SB_URL}/rest/v1/global_stores?select=id,name,logo_url,category,store_url,sort_order,is_active&is_active=eq.true&order=sort_order.asc,id.asc`,{cache:'no-store',headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`}});
      if(!r.ok)return;
      const data=await r.json();
      if(!Array.isArray(data)||!data.length)return;
      const gs=grids(),existing=new Map();
      Object.values(gs).forEach(g=>g.querySelectorAll('.store-card').forEach(c=>{const n=String(c.querySelector('h3')?.textContent||'').trim().toLocaleLowerCase();if(n)existing.set(n,c)}));
      data.forEach(st=>{
        const target=gs[String(st.category||'comprehensive')]||gs.comprehensive;
        if(!target)return;
        const key=String(st.name||'').trim().toLocaleLowerCase();
        const current=existing.get(key);
        if(current){
          const logo=safeUrl(st.logo_url),img=current.querySelector('.store-logo'),link=current.querySelector('.store-link'),url=safeUrl(st.store_url);
          if(img&&logo&&img.getAttribute('src')!==logo)img.src=logo;
          if(link&&url){link.href=url;link.target='_blank';link.rel='noopener noreferrer'}
          return;
        }
        const node=card(st);target.appendChild(node);if(key)existing.set(key,node);
      });
    }catch(e){console.warn('Global stores cloud list unavailable; keeping static stores.',e)}
  }
'''
js = js[:load_start] + new_load + js[load_end:]

# 3) Final logo polish override. Light mode blends white PNG canvases into the warm card background.
polish_marker = '/* MESHWAR_STORE_LOGO_POLISH_V5 */'
if polish_marker not in js:
    js += r'''

/* MESHWAR_STORE_LOGO_POLISH_V5 */
(function(){
  const css=`
.logo-container{height:82px!important;min-height:82px!important;width:100%!important;padding:0!important;background:transparent!important;border:0!important;box-shadow:none!important;overflow:hidden!important;display:flex!important;align-items:center!important;justify-content:center!important}
.logo-container::before,.logo-container::after{display:none!important;content:none!important}
.logo-container>.store-logo{display:block!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;object-fit:contain!important;object-position:center!important;padding:4px!important;margin:0!important;background:transparent!important;border:0!important;border-radius:0!important;box-shadow:none!important;box-sizing:border-box!important;mix-blend-mode:multiply!important}
html.dark .logo-container>.store-logo{mix-blend-mode:normal!important}
.meshwar-store-name-fallback{width:100%!important;height:100%!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:8px!important;color:#D4AF37!important;background:transparent!important;border:0!important;font-size:18px!important;font-weight:900!important;letter-spacing:.02em!important;text-align:center!important}
`;
  function install(){if(document.getElementById('meshwarStoreLogoPolishV5'))return;const s=document.createElement('style');s.id='meshwarStoreLogoPolishV5';s.textContent=css;document.head.appendChild(s)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
'''
JS.write_text(js, encoding='utf-8')
