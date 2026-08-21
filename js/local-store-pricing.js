(function(){
  function ceilNumber(value){
    const n=Number(value);
    return Number.isFinite(n)?Math.ceil(n):0;
  }
  function commissionFraction(rate){
    const n=Number(rate);
    return Number.isFinite(n)&&n>=0&&n<100?n/100:0.10;
  }
  function customerPriceUSD(vendorPrice,commissionRate){
    const v=Number(vendorPrice);
    if(!Number.isFinite(v)||v<0)return null;
    return ceilNumber(v/(1-commissionFraction(commissionRate)));
  }
  function customerPriceLocal(vendorPrice,commissionRate,exchangeRate){
    const usd=customerPriceUSD(vendorPrice,commissionRate);
    const rate=Number(exchangeRate);
    if(usd===null||!Number.isFinite(rate)||rate<=0)return null;
    const rawLocalPrice=usd*rate;
    return Math.ceil(rawLocalPrice/1000)*1000;
  }
  function discountPercent(basePrice,discountPrice){
    const base=Number(basePrice),discount=Number(discountPrice);
    if(!Number.isFinite(base)||!Number.isFinite(discount)||base<=0||discount<0||discount>=base)return null;
    return Math.max(1,Math.min(99,Math.round(((base-discount)/base)*100)));
  }
  function pricingSnapshot(vendorPrice,commissionRate,exchangeRate,localCurrency='IQD'){
    const vendor=Number(vendorPrice),rate=Number(exchangeRate),commission=Number(commissionRate);
    const usd=customerPriceUSD(vendor,commission);
    const local=customerPriceLocal(vendor,commission,rate);
    if(usd===null||local===null)return null;
    return {
      pricing_version:'iqd_ceil_1000_v1',
      vendor_price_usd:vendor,
      commission_rate:Number.isFinite(commission)&&commission>=0&&commission<100?commission:10,
      exchange_rate:rate,
      customer_price_usd:ceilNumber(usd),
      customer_price_local:ceilNumber(local),
      local_currency:String(localCurrency||'IQD').toUpperCase()
    };
  }
  window.MeshwarLocalPricing={ceilNumber,commissionFraction,customerPriceUSD,customerPriceLocal,discountPercent,pricingSnapshot};
})();

/* PUBLIC_SITE_SETTINGS_CMS_V3 */
(function(){
  const SB_URL='https://hsmmbloouskqdnptiiad.supabase.co';
  const SB_KEY='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
  const DEFAULTS={video_url:'videos/promo.mp4',video_poster:'',announcement_text:'✨ عروض MeshWar الجديدة قريباً • تابع أحدث المتاجر والخصومات والخدمات من مكان واحد • أهلاً بكم في MeshWar ✨',is_active:true,hero_title:'تسوّق، اطلب، وتابع\nمن مكان واحد.',hero_subtitle:'واجهة موحدة للمتاجر المحلية والعالمية مع وصول سريع للطلب والتتبع.',cta_primary_text:'طلب منتج مباشر',cta_primary_url:'#orderModal',cta_secondary_text:'المتاجر المحلية',cta_secondary_url:'#localStoresPublic',whatsapp_url:'',whatsapp_active:false,facebook_url:'',facebook_active:false,instagram_url:'',instagram_active:false,telegram_url:'',telegram_active:false,tiktok_url:'',tiktok_active:false,support_phone:'',support_email:'',contact_address:'',site_title:'منصة MeshWar - دليل المتاجر والشحن الدولي',meta_description:'',favicon_url:''};
  const parse=v=>{if(!v)return{};if(typeof v==='object'&&!Array.isArray(v))return v;try{const x=JSON.parse(v);return x&&typeof x==='object'&&!Array.isArray(x)?x:{}}catch{return{}}};
  const safeUrl=(v,{hash=true}={})=>{const s=String(v||'').trim();if(!s)return'';if(hash&&s.startsWith('#'))return s;return /^(https?:\/\/|\/|\.\/|\.\.\/|[A-Za-z0-9_-]+\/)/i.test(s)?s:''};
  const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  function cleanVideoUrl(value){const s=String(value||'').trim();if(!s)return'';if(/^https?:\/\//i.test(s)||(/^(\/|\.\/|\.\.\/|[A-Za-z0-9_-]+\/)/.test(s)&&!s.includes('http')))return s;const hits=[...s.matchAll(/https?:\/\/[^\s]+/gi)];return hits.length?hits[hits.length-1][0]:s}
  function youtubeEmbedUrl(value){
    const raw=cleanVideoUrl(value);if(!raw)return'';
    try{
      const u=new URL(raw,location.href),host=u.hostname.replace(/^www\./,'').toLowerCase();let id='';
      if(host==='youtu.be')id=u.pathname.split('/').filter(Boolean)[0]||'';
      else if(host==='youtube.com'||host==='m.youtube.com'||host==='music.youtube.com'){
        if(u.pathname==='/watch')id=u.searchParams.get('v')||'';
        else{const m=u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/);id=m?.[1]||''}
      }
      id=id.replace(/[^A-Za-z0-9_-]/g,'');
      return id?`https://www.youtube.com/embed/${id}?rel=0&playsinline=1`:'';
    }catch{return''}
  }
  function heroNodes(){const section=document.querySelector('body > nav + section');if(!section)return{};const actions=[...section.querySelectorAll('button,a')].filter(e=>/طلب منتج مباشر|المتاجر المحلية/.test(e.textContent||''));return{title:section.querySelector('h2'),subtitle:section.querySelector('p'),primary:actions[0],secondary:actions[1]}}
  function navigate(url){const u=safeUrl(url);if(!u)return;if(u==='#orderModal'){const m=document.getElementById('orderModal');if(m)m.style.display='block';return}if(u.startsWith('#')){document.querySelector(u)?.scrollIntoView({behavior:'smooth',block:'start'});return}location.href=u}
  function metaDescription(){let e=document.querySelector('meta[name="description"]');if(!e){e=document.createElement('meta');e.name='description';document.head.appendChild(e)}return e}
  function favicon(){let e=document.querySelector('link[rel~="icon"]');if(!e){e=document.createElement('link');e.rel='icon';document.head.appendChild(e)}return e}
  function socialAnchor(footer,label,icon){let a=footer?.querySelector(`a[aria-label="${label}"]`);if(!a&&footer){const wrap=footer.querySelector('.flex.items-center.gap-3');if(!wrap)return null;a=document.createElement('a');a.setAttribute('aria-label',label);a.className='flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/5 text-lg text-slate-200 transition hover:scale-110';a.innerHTML=`<i class="fa-brands fa-${icon}"></i>`;wrap.appendChild(a)}return a}
  function applySocial(a,url,active){if(!a)return;const u=safeUrl(url,{hash:false});a.style.display=active&&u?'flex':'none';if(u){a.href=u;a.target='_blank';a.rel='noopener noreferrer'}}
  function contactBox(footer){let e=document.getElementById('meshwarCmsContact');if(e)return e;const host=footer?.querySelector('.font-black.text-white')?.parentElement;if(!host)return null;e=document.createElement('div');e.id='meshwarCmsContact';e.style.cssText='margin-top:9px;color:#cbd5e1;font-size:12px;line-height:1.8';host.appendChild(e);return e}
  function appendContactLine(box,prefix,value,href=''){const text=String(value||'').trim();if(!text)return;if(box.childNodes.length)box.appendChild(document.createElement('br'));box.appendChild(document.createTextNode(prefix));if(href){const a=document.createElement('a');a.href=href;a.textContent=text;box.appendChild(a)}else box.appendChild(document.createTextNode(text))}
  function youtubeFrame(video){let f=document.getElementById('meshwarPromoYoutube');if(f)return f;f=document.createElement('iframe');f.id='meshwarPromoYoutube';f.title='MeshWar promo video';f.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';f.allowFullscreen=true;f.referrerPolicy='strict-origin-when-cross-origin';f.style.cssText='display:none;width:100%;aspect-ratio:16/9;border:0;border-radius:inherit;background:#000';video.insertAdjacentElement('afterend',f);return f}
  function applyVideo(s){const video=document.getElementById('meshwarPromoVideo');if(!video)return;const cleaned=cleanVideoUrl(s.video_url),raw=safeUrl(cleaned,{hash:false}),embed=youtubeEmbedUrl(cleaned),frame=youtubeFrame(video);if(embed){video.pause?.();video.style.display='none';frame.src=embed;frame.style.display='block';return}frame.style.display='none';if(frame.src)frame.src='about:blank';video.style.display='';if(!raw)return;const source=video.querySelector('source');if(source)source.src=raw;else video.src=raw;video.poster=safeUrl(s.video_poster,{hash:false})||'';video.load();video.play().catch(()=>{})}
  function apply(raw){const s={...DEFAULTS,...raw};if(s.site_title)document.title=String(s.site_title);metaDescription().content=String(s.meta_description||'');const fav=safeUrl(s.favicon_url,{hash:false});if(fav)favicon().href=fav;const hero=heroNodes();if(hero.title){hero.title.textContent=String(s.hero_title||'');hero.title.style.whiteSpace='pre-line'}if(hero.subtitle)hero.subtitle.textContent=String(s.hero_subtitle||'');if(hero.primary){hero.primary.textContent=String(s.cta_primary_text||'');hero.primary.dataset.cmsUrl=safeUrl(s.cta_primary_url)||'#orderModal';hero.primary.onclick=e=>{e.preventDefault();navigate(hero.primary.dataset.cmsUrl)}}if(hero.secondary){hero.secondary.textContent=String(s.cta_secondary_text||'');hero.secondary.href=safeUrl(s.cta_secondary_url)||'#localStoresPublic'}applyVideo(s);const ticker=document.getElementById('meshwarTicker');if(ticker){ticker.style.display=s.is_active&&String(s.announcement_text||'').trim()?'':'none';const track=ticker.querySelector('.meshwar-ticker-track');if(track)track.textContent=String(s.announcement_text||'')}const footer=document.getElementById('meshwarSocialFooter');if(footer){applySocial(socialAnchor(footer,'WhatsApp','whatsapp'),s.whatsapp_url,s.whatsapp_active);applySocial(socialAnchor(footer,'Facebook','facebook-f'),s.facebook_url,s.facebook_active);applySocial(socialAnchor(footer,'Instagram','instagram'),s.instagram_url,s.instagram_active);applySocial(socialAnchor(footer,'Telegram','telegram'),s.telegram_url,s.telegram_active);applySocial(socialAnchor(footer,'TikTok','tiktok'),s.tiktok_url,s.tiktok_active);const box=contactBox(footer);if(box){box.replaceChildren();appendContactLine(box,'☎ ',s.support_phone);const email=String(s.support_email||'').trim();appendContactLine(box,'✉ ',email,email?`mailto:${email}`:'');appendContactLine(box,'📍 ',s.contact_address);box.style.display=box.childNodes.length?'block':'none'}}}
  async function load(){try{const r=await fetch(`${SB_URL}/rest/v1/rpc/get_site_settings`,{method:'POST',cache:'no-store',headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`,'Content-Type':'application/json',Accept:'application/json'},body:'{}'});if(!r.ok)throw new Error('site_settings RPC HTTP '+r.status);const value=await r.json();if(value==null)return;apply(parse(value))}catch(e){console.warn('MeshWar CMS settings were not applied; keeping page defaults.',e)}}
  window.loadPublicSiteSettings=load;if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();

/* MESHWAR_LUXURY_UI_V1 */
(function(){
  const css=`
:root{--mw-navy:#0B132B;--mw-navy-2:#1C2541;--mw-gold:#D4AF37;--mw-gold-soft:#C5A059;--mw-cream:#F7F3EA}
body{background:radial-gradient(circle at 15% 0%,rgba(197,160,89,.10),transparent 34%),var(--mw-cream)!important;color:#182033!important}
html.dark body{background:radial-gradient(circle at 15% 0%,rgba(212,175,55,.10),transparent 34%),linear-gradient(180deg,#07101f 0%,var(--mw-navy) 52%,#08101f 100%)!important;color:#eef2f7!important}
body>nav{background:rgba(11,19,43,.94)!important;border-color:rgba(212,175,55,.22)!important}
body>nav a,body>nav button{border-color:rgba(212,175,55,.30)!important}
body>nav a:hover,body>nav button:hover{border-color:var(--mw-gold)!important;color:#f3d878!important}
body>nav+section>div:first-child{border-color:rgba(197,160,89,.30)!important;background:linear-gradient(135deg,rgba(255,252,245,.92),rgba(247,243,234,.82))!important;box-shadow:0 24px 70px rgba(11,19,43,.12)!important}
html.dark body>nav+section>div:first-child{background:linear-gradient(135deg,rgba(11,19,43,.94),rgba(28,37,65,.88))!important;box-shadow:0 26px 75px rgba(0,0,0,.30),0 0 0 1px rgba(212,175,55,.05)!important}
body>nav+section h2 span{background:none!important;color:var(--mw-gold)!important;-webkit-text-fill-color:var(--mw-gold)!important}
body>nav+section>div:first-child>div:first-child>div:last-child{display:none!important}
body>nav+section>div:first-child>div:last-child{border-color:rgba(212,175,55,.32)!important;background:linear-gradient(145deg,#111c36,#0B132B)!important}
#meshwarHeroTrackBtn,.store-link,.local-public-open{background:linear-gradient(135deg,#C5A059,#D4AF37)!important;border-color:#e2c766!important;color:#0B132B!important;box-shadow:0 10px 28px rgba(212,175,55,.16)!important}
.fixed-order-btn{background:linear-gradient(135deg,#C5A059,#D4AF37)!important;color:#0B132B!important;border:1px solid #efd976!important;box-shadow:0 14px 38px rgba(212,175,55,.30)!important;padding:14px 22px!important}
.fixed-order-btn:hover{transform:translateY(-2px) scale(1.03)!important;box-shadow:0 18px 46px rgba(212,175,55,.38)!important}
.header-container,.local-stores-shell{border-color:rgba(197,160,89,.28)!important;background:rgba(255,252,245,.82)!important}
html.dark .header-container,html.dark .local-stores-shell{background:rgba(11,19,43,.76)!important;border-color:rgba(212,175,55,.22)!important}
.header-container h1,.section-title{color:#8f6f19!important}html.dark .header-container h1,html.dark .section-title{color:#e1c45d!important}
.store-card,.local-public-card{border-radius:20px!important;border-color:rgba(197,160,89,.24)!important;background:rgba(255,252,245,.86)!important;box-shadow:0 12px 34px rgba(11,19,43,.09)!important;overflow:hidden!important}
html.dark .store-card,html.dark .local-public-card{background:linear-gradient(145deg,rgba(28,37,65,.78),rgba(11,19,43,.84))!important;border-color:rgba(212,175,55,.20)!important;box-shadow:0 14px 38px rgba(0,0,0,.22)!important}
.store-card:hover,.local-public-card:hover{transform:translateY(-4px)!important;border-color:rgba(212,175,55,.58)!important;box-shadow:0 18px 46px rgba(212,175,55,.12)!important}
.logo-container{position:relative!important;overflow:hidden!important;border:1px solid rgba(197,160,89,.14)!important;background:rgba(255,255,255,.58)!important}
html.dark .logo-container{background:rgba(255,255,255,.04)!important}
.meshwar-logo-fallback{display:flex;width:100%;height:100%;align-items:center;justify-content:center;border-radius:12px;background:linear-gradient(135deg,#0B132B,#1C2541);color:#e5c95f;font-weight:900;font-size:13px;letter-spacing:.2px;text-align:center;padding:6px;box-sizing:border-box;border:1px solid rgba(212,175,55,.28)}
#meshwarTicker{border-color:rgba(212,175,55,.28)!important;background:rgba(11,19,43,.92)!important}.meshwar-ticker-track{color:#ead477!important}
#meshwarStoreTabs>div{border-color:rgba(212,175,55,.22)!important;background:rgba(11,19,43,.90)!important}#showInternationalStoresBtn,#showLocalStoresBtn:hover{background:linear-gradient(135deg,#C5A059,#D4AF37)!important;color:#0B132B!important;border-color:#e6cd72!important}#showLocalStoresBtn{border-color:rgba(212,175,55,.32)!important}
.local-filter-btn.active,.local-filter-btn:hover{background:linear-gradient(135deg,#C5A059,#D4AF37)!important;color:#0B132B!important;border-color:#e6cd72!important}.local-public-chip{color:#b88c20!important}html.dark .local-public-chip{color:#e6cd72!important}
@media(max-width:640px){body{padding:10px!important}.fixed-order-btn{right:14px!important;bottom:16px!important;padding:12px 16px!important;font-size:14px!important}.user-auth-zone{left:12px!important;bottom:14px!important}.header-container{margin-top:18px!important;padding:22px 14px!important}.grid-container{gap:10px!important;padding-left:2px!important;padding-right:2px!important}.store-card{min-height:150px!important;padding:11px!important}.section-title{margin-top:36px!important;padding-right:4px!important;padding-left:4px!important}body>nav+section{padding-left:2px!important;padding-right:2px!important}body>nav+section>div:first-child{padding:20px 16px!important}body>nav+section h2{font-size:2rem!important;line-height:1.25!important}}
`;
  function installStyles(){if(document.getElementById('meshwarLuxuryUi'))return;const style=document.createElement('style');style.id='meshwarLuxuryUi';style.textContent=css;document.head.appendChild(style)}
  function removeHeroActions(){const hero=document.querySelector('body > nav + section > div:first-child');const first=hero?.firstElementChild;if(!first)return;[...first.querySelectorAll('button,a')].filter(el=>/طلب منتج مباشر|المتاجر المحلية/.test(el.textContent||'')).forEach(el=>el.remove())}
  function logoFallback(img){if(!img||img.dataset.mwFallback==='1')return;img.dataset.mwFallback='1';img.addEventListener('error',()=>{const box=img.closest('.logo-container');if(!box)return;const name=img.alt||img.closest('.store-card')?.querySelector('h3')?.textContent||'Store';const badge=document.createElement('div');badge.className='meshwar-logo-fallback';badge.textContent=name;img.remove();box.replaceChildren(badge)},{once:true})}
  function polish(){installStyles();removeHeroActions();document.querySelectorAll('.store-logo').forEach(logoFallback)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',polish,{once:true});else polish();
})();

/* MESHWAR_LUXURY_UI_POLISH_V2 */
(function(){
  const css=`
@keyframes meshwarGoldPulse{0%,100%{box-shadow:0 12px 34px rgba(212,175,55,.34),0 0 0 0 rgba(255,223,115,.36)}50%{box-shadow:0 18px 48px rgba(212,175,55,.52),0 0 0 13px rgba(255,223,115,0)}}
body{background:linear-gradient(145deg,#fbf8f0 0%,#f6f0e4 48%,#f3ead9 100%)!important;background-attachment:fixed!important}
html.dark body{background:radial-gradient(circle at 18% 0%,rgba(212,175,55,.10),transparent 30%),linear-gradient(180deg,#07101f 0%,#0B132B 55%,#08101e 100%)!important}
.fixed-order-btn{min-width:156px!important;min-height:58px!important;padding:17px 28px!important;font-size:17px!important;font-weight:900!important;letter-spacing:.1px!important;background:linear-gradient(135deg,#D4AF37 0%,#FFDF73 100%)!important;color:#0B132B!important;border:1px solid rgba(255,239,170,.92)!important;box-shadow:0 12px 34px rgba(212,175,55,.38)!important;animation:meshwarGoldPulse 2.35s ease-in-out infinite!important}
.fixed-order-btn i{font-size:18px!important}.fixed-order-btn:hover{animation-play-state:paused!important;transform:translateY(-3px) scale(1.05)!important;box-shadow:0 20px 52px rgba(212,175,55,.52)!important}
.store-card{border:1px solid rgba(212,175,55,.28)!important;background:linear-gradient(160deg,rgba(255,253,248,.96),rgba(249,244,234,.90))!important;box-shadow:0 14px 36px rgba(51,42,20,.08),inset 0 1px rgba(255,255,255,.75)!important}
html.dark .store-card{border-color:rgba(212,175,55,.26)!important;background:linear-gradient(155deg,rgba(28,37,65,.90),rgba(11,19,43,.94))!important;box-shadow:0 15px 40px rgba(0,0,0,.28),inset 0 1px rgba(255,255,255,.03)!important}
.logo-container{height:78px!important;min-height:78px!important;border-radius:14px!important;border:1px solid rgba(212,175,55,.20)!important;background:linear-gradient(145deg,#fffdf8,#f7f0e3)!important;padding:10px!important;box-sizing:border-box!important;display:flex!important;align-items:center!important;justify-content:center!important}
html.dark .logo-container{background:linear-gradient(145deg,rgba(255,255,255,.07),rgba(255,255,255,.025))!important;border-color:rgba(212,175,55,.24)!important}
.store-logo{max-width:88%!important;max-height:58px!important;object-fit:contain!important}.meshwar-logo-fallback{min-height:56px!important;width:100%!important;border-radius:12px!important;background:linear-gradient(135deg,#0B132B,#1C2541)!important;color:#FFDF73!important;border:1px solid rgba(212,175,55,.56)!important;box-shadow:inset 0 1px rgba(255,255,255,.05),0 8px 20px rgba(11,19,43,.14)!important;font-size:14px!important;font-weight:900!important}
@media(max-width:640px){.fixed-order-btn{right:14px!important;bottom:16px!important;min-width:142px!important;min-height:54px!important;padding:15px 20px!important;font-size:15px!important}.logo-container{height:70px!important;min-height:70px!important}.store-card{border-color:rgba(212,175,55,.30)!important}}
@media(prefers-reduced-motion:reduce){.fixed-order-btn{animation:none!important}}
`;
  function install(){if(document.getElementById('meshwarLuxuryPolishV2'))return;const style=document.createElement('style');style.id='meshwarLuxuryPolishV2';style.textContent=css;document.head.appendChild(style)}
  function replaceBrokenLogo(img){if(!img||img.dataset.mwPolishFallback==='1')return;img.dataset.mwPolishFallback='1';const replace=()=>{if(!img.isConnected)return;const box=img.closest('.logo-container');if(!box)return;const card=img.closest('.store-card');const name=String(card?.querySelector('h3')?.textContent||img.alt||'Store').trim();const badge=document.createElement('div');badge.className='meshwar-logo-fallback';badge.textContent=name||'Store';box.replaceChildren(badge)};img.addEventListener('error',replace,{once:true});if(img.complete&&img.naturalWidth===0)replace()}
  function bindLogos(root=document){root.querySelectorAll?.('.store-logo').forEach(replaceBrokenLogo)}
  function start(){install();bindLogos();const observer=new MutationObserver(mutations=>mutations.forEach(m=>m.addedNodes.forEach(node=>{if(node.nodeType!==1)return;if(node.matches?.('.store-logo'))replaceBrokenLogo(node);bindLogos(node)})));observer.observe(document.body,{childList:true,subtree:true})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

/* MESHWAR_STORE_LOGO_FIT_V3 */
(function(){
  const css=`
.logo-container{width:100%!important;height:70px!important;min-height:70px!important;padding:8px!important;border-radius:14px!important;display:flex!important;align-items:center!important;justify-content:center!important;overflow:hidden!important;background:linear-gradient(145deg,#fff,#fbf7ee)!important;border:1px solid rgba(212,175,55,.24)!important;box-sizing:border-box!important}
html.dark .logo-container{background:linear-gradient(145deg,rgba(255,255,255,.085),rgba(255,255,255,.025))!important;border-color:rgba(212,175,55,.26)!important}
.logo-container>.store-logo,.logo-container>.meshwar-store-fallback{width:100%!important;height:100%!important;max-width:100%!important;max-height:100%!important;object-fit:contain!important;display:block!important}
.meshwar-store-fallback{padding:7px!important;box-sizing:border-box!important;border-radius:10px!important;background:transparent!important}
.fixed-order-btn{border:1px solid #FFDF73!important;box-shadow:0 10px 25px -5px rgba(212,175,55,.40),0 0 0 1px rgba(255,223,115,.10)!important}
.fixed-order-btn i{filter:drop-shadow(0 1px 0 rgba(255,255,255,.35))!important}
`;
  const FALLBACK_SVG=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 80" role="img" aria-label="Store logo"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0B132B"/><stop offset="1" stop-color="#1C2541"/></linearGradient></defs><rect x="1" y="1" width="158" height="78" rx="14" fill="url(#g)" stroke="#D4AF37" stroke-opacity=".65"/><path d="M50 35h60l-5 30H55l-5-30Zm8-12h44l6 12H52l6-12Z" fill="none" stroke="#FFDF73" stroke-width="5" stroke-linejoin="round"/><circle cx="68" cy="69" r="4" fill="#FFDF73"/><circle cx="96" cy="69" r="4" fill="#FFDF73"/></svg>`;
  const FALLBACK_SRC='data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(FALLBACK_SVG);
  function install(){if(document.getElementById('meshwarStoreLogoFitV3'))return;const style=document.createElement('style');style.id='meshwarStoreLogoFitV3';style.textContent=css;document.head.appendChild(style)}
  function fallbackImage(box,label){const img=document.createElement('img');img.className='meshwar-store-fallback';img.src=FALLBACK_SRC;img.alt=(label||'Store')+' placeholder';img.setAttribute('aria-label',(label||'Store')+' logo unavailable');box.replaceChildren(img)}
  function normalizeBox(box){if(!box)return;const brokenBadge=box.querySelector('.meshwar-logo-fallback');if(brokenBadge){const label=brokenBadge.textContent?.trim()||box.closest('.store-card')?.querySelector('h3')?.textContent?.trim()||'Store';fallbackImage(box,label);return}const img=box.querySelector('.store-logo');if(!img)return;const label=img.alt||box.closest('.store-card')?.querySelector('h3')?.textContent||'Store';const fail=()=>fallbackImage(box,label);img.addEventListener('error',fail,{once:true});if(img.complete&&img.naturalWidth===0)fail()}
  function scan(root=document){if(root.matches?.('.logo-container'))normalizeBox(root);root.querySelectorAll?.('.logo-container').forEach(normalizeBox)}
  function start(){install();scan();const observer=new MutationObserver(mutations=>mutations.forEach(m=>m.addedNodes.forEach(node=>{if(node.nodeType===1)scan(node)})));observer.observe(document.body,{childList:true,subtree:true})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

/* MESHWAR_STORE_LOGO_TEXT_FALLBACK_V4 */
(function(){
  const css=`
.logo-container{width:100%!important;height:70px!important;min-height:70px!important;padding:0!important;display:flex!important;align-items:center!important;justify-content:center!important;overflow:hidden!important;background:rgba(255,255,255,.16)!important;border:1px solid rgba(212,175,55,.24)!important;box-sizing:border-box!important}
html.dark .logo-container{background:rgba(255,255,255,.035)!important;border-color:rgba(212,175,55,.28)!important}
.logo-container>.store-logo{width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;object-fit:contain!important;padding:6px!important;box-sizing:border-box!important;background:transparent!important;border:0!important;border-radius:0!important}
.logo-container>.meshwar-store-fallback{display:none!important}
.meshwar-store-name-fallback{width:100%!important;height:100%!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:8px!important;box-sizing:border-box!important;color:#D4AF37!important;font-size:18px!important;font-weight:900!important;line-height:1.2!important;letter-spacing:.25px!important;text-align:center!important;background:transparent!important;text-shadow:0 1px 14px rgba(212,175,55,.16)!important}
@media(max-width:640px){.meshwar-store-name-fallback{font-size:16px!important}.logo-container>.store-logo{padding:6px!important}}
`;
  function install(){if(document.getElementById('meshwarStoreLogoTextFallbackV4'))return;const style=document.createElement('style');style.id='meshwarStoreLogoTextFallbackV4';style.textContent=css;document.head.appendChild(style)}
  function storeName(box,img){return String(box?.closest('.store-card')?.querySelector('h3')?.textContent||img?.alt||'Store').trim()||'Store'}
  function showName(box,label){if(!box)return;const name=document.createElement('div');name.className='meshwar-store-name-fallback';name.textContent=label||'Store';name.setAttribute('role','img');name.setAttribute('aria-label',(label||'Store')+' logo unavailable');box.replaceChildren(name)}
  function normalize(box){if(!box||box.querySelector('.meshwar-store-name-fallback'))return;const oldText=box.querySelector('.meshwar-logo-fallback');if(oldText){showName(box,String(oldText.textContent||'Store').trim());return}const oldSvg=box.querySelector('.meshwar-store-fallback');if(oldSvg){showName(box,storeName(box,oldSvg));return}const img=box.querySelector('.store-logo');if(!img)return;const label=storeName(box,img);const fail=()=>showName(box,label);img.addEventListener('error',fail,{once:true});if(img.complete&&img.naturalWidth===0)fail()}
  function scan(root=document){if(root.matches?.('.logo-container'))normalize(root);root.querySelectorAll?.('.logo-container').forEach(normalize)}
  function start(){install();scan();const observer=new MutationObserver(mutations=>mutations.forEach(m=>m.addedNodes.forEach(node=>{if(node.nodeType===1)scan(node)})));observer.observe(document.body,{childList:true,subtree:true})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();


/* MESHWAR_GLOBAL_STORES_PUBLIC_V1 */
(function(){
  const SB_URL='https://hsmmbloouskqdnptiiad.supabase.co',SB_KEY='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
  const categoryLabels={comprehensive:'المتاجر الشاملة',fashion:'الأزياء والملابس',sports:'الرياضة والأحذية',beauty:'التجميل والعناية',home:'المنزل والأطفال والسوبر ماركت'};
  const css=`
.logo-container{height:78px!important;min-height:78px!important;padding:0!important;background:transparent!important;border:1px solid rgba(212,175,55,.18)!important;box-shadow:none!important}
html.dark .logo-container{background:transparent!important;border-color:rgba(212,175,55,.24)!important}
.logo-container>.store-logo{width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;object-fit:contain!important;padding:2px!important;box-sizing:border-box!important;background:transparent!important;border:0!important;border-radius:0!important;box-shadow:none!important}
.store-card:hover .store-logo{transform:scale(1.06)!important}
`;
  function install(){if(document.getElementById('meshwarGlobalStoresPublicV1'))return;const s=document.createElement('style');s.id='meshwarGlobalStoresPublicV1';s.textContent=css;document.head.appendChild(s)}
  function safeUrl(v){const s=String(v||'').trim();return /^(https?:\/\/|images\/|data:image\/(?:png|jpeg|webp|gif|svg\+xml);base64,)/i.test(s)?s:''}
  function grids(){const root=document.getElementById('internationalStoresSection'),out={};if(!root)return out;root.querySelectorAll('.section-title').forEach(h=>{const key=Object.keys(categoryLabels).find(k=>String(h.textContent||'').trim()===categoryLabels[k]);const g=h.nextElementSibling;if(key&&g?.classList.contains('grid-container'))out[key]=g});return out}
  function card(store){const c=document.createElement('div');c.className='store-card';const box=document.createElement('div');box.className='logo-container';const logo=safeUrl(store.logo_url);if(logo){const img=document.createElement('img');img.className='store-logo';img.src=logo;img.alt=String(store.name||'Store');img.addEventListener('error',()=>{const n=document.createElement('div');n.className='meshwar-store-name-fallback';n.textContent=String(store.name||'Store');box.replaceChildren(n)},{once:true});box.appendChild(img)}else{const n=document.createElement('div');n.className='meshwar-store-name-fallback';n.textContent=String(store.name||'Store');box.appendChild(n)}const h=document.createElement('h3');h.textContent=String(store.name||'');const a=document.createElement('a');a.className='store-link';a.textContent='تصفح';const u=safeUrl(store.store_url);if(u){a.href=u;a.target='_blank';a.rel='noopener noreferrer'}else{a.href='#';a.addEventListener('click',e=>e.preventDefault())}c.append(box,h,a);return c}
  async function load(){
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
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();


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

/* MESHWAR_STORE_LOGO_VISUAL_POLISH_V6 */
(function(){
  const css=`
.logo-container{height:86px!important;min-height:86px!important;width:100%!important;padding:0!important;background:transparent!important;border:0!important;box-shadow:none!important;overflow:hidden!important}
.logo-container>.store-logo{width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;object-fit:contain!important;object-position:center!important;padding:0!important;margin:0!important;background:transparent!important;border:0!important;border-radius:0!important;box-shadow:none!important;transform:scale(1.10)!important;transform-origin:center!important;filter:saturate(1.04) contrast(1.03)!important}
html:not(.dark) .logo-container>.store-logo{mix-blend-mode:multiply!important}
.store-card:hover .logo-container>.store-logo{transform:scale(1.15)!important}
.meshwar-store-name-fallback{transform:none!important;mix-blend-mode:normal!important}
@media(max-width:640px){.logo-container{height:78px!important;min-height:78px!important}.logo-container>.store-logo{transform:scale(1.08)!important}.store-card:hover .logo-container>.store-logo{transform:scale(1.12)!important}}
`;
  function install(){if(document.getElementById('meshwarStoreLogoVisualPolishV6'))return;const s=document.createElement('style');s.id='meshwarStoreLogoVisualPolishV6';s.textContent=css;document.head.appendChild(s)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();


/* MESHWAR_LOCAL_PRODUCT_DETAILS_V4_LOADER */
(function(){
  if(document.querySelector('script[data-mw-product-details-v4]'))return;
  const s=document.createElement('script');
  s.src='js/local-store-product-details-v4.js?v=local-modal-v4-2';
  s.defer=true;
  s.dataset.mwProductDetailsV4='1';
  document.head.appendChild(s);
})();
