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

/* PUBLIC_SITE_SETTINGS_CMS_V1 */
(function(){
  const SB_URL='https://hsmmbloouskqdnptiiad.supabase.co';
  const SB_KEY='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
  const DEFAULTS={video_url:'videos/promo.mp4',video_poster:'',announcement_text:'✨ عروض MeshWar الجديدة قريباً • تابع أحدث المتاجر والخصومات والخدمات من مكان واحد • أهلاً بكم في MeshWar ✨',is_active:true,hero_title:'تسوّق، اطلب، وتابع\nمن مكان واحد.',hero_subtitle:'واجهة موحدة للمتاجر المحلية والعالمية مع وصول سريع للطلب والتتبع.',cta_primary_text:'طلب منتج مباشر',cta_primary_url:'#orderModal',cta_secondary_text:'المتاجر المحلية',cta_secondary_url:'#localStoresPublic',whatsapp_url:'',whatsapp_active:false,facebook_url:'',facebook_active:false,instagram_url:'',instagram_active:false,telegram_url:'',telegram_active:false,tiktok_url:'',tiktok_active:false,support_phone:'',support_email:'',contact_address:'',site_title:'منصة MeshWar - دليل المتاجر والشحن الدولي',meta_description:'',favicon_url:''};
  const parse=v=>{if(!v)return{};if(typeof v==='object'&&!Array.isArray(v))return v;try{const x=JSON.parse(v);return x&&typeof x==='object'&&!Array.isArray(x)?x:{}}catch{return{}}};
  const safeUrl=(v,{hash=true}={})=>{const s=String(v||'').trim();if(!s)return'';if(hash&&s.startsWith('#'))return s;return /^(https?:\/\/|\/|\.\/|\.\.\/|[A-Za-z0-9_-]+\/)/i.test(s)?s:''};
  const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  function heroNodes(){const section=document.querySelector('body > nav + section');if(!section)return{};const actions=[...section.querySelectorAll('button,a')].filter(e=>/طلب منتج مباشر|المتاجر المحلية/.test(e.textContent||''));return{title:section.querySelector('h2'),subtitle:section.querySelector('p'),primary:actions[0],secondary:actions[1]}}
  function navigate(url){const u=safeUrl(url);if(!u)return;if(u==='#orderModal'){const m=document.getElementById('orderModal');if(m)m.style.display='block';return}if(u.startsWith('#')){document.querySelector(u)?.scrollIntoView({behavior:'smooth',block:'start'});return}location.href=u}
  function metaDescription(){let e=document.querySelector('meta[name="description"]');if(!e){e=document.createElement('meta');e.name='description';document.head.appendChild(e)}return e}
  function favicon(){let e=document.querySelector('link[rel~="icon"]');if(!e){e=document.createElement('link');e.rel='icon';document.head.appendChild(e)}return e}
  function socialAnchor(footer,label,icon){let a=footer?.querySelector(`a[aria-label="${label}"]`);if(!a&&footer){const wrap=footer.querySelector('.flex.items-center.gap-3');if(!wrap)return null;a=document.createElement('a');a.setAttribute('aria-label',label);a.className='flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/5 text-lg text-slate-200 transition hover:scale-110';a.innerHTML=`<i class="fa-brands fa-${icon}"></i>`;wrap.appendChild(a)}return a}
  function applySocial(a,url,active){if(!a)return;const u=safeUrl(url,{hash:false});a.style.display=active&&u?'flex':'none';if(u){a.href=u;a.target='_blank';a.rel='noopener noreferrer'}}
  function contactBox(footer){let e=document.getElementById('meshwarCmsContact');if(e)return e;const host=footer?.querySelector('.font-black.text-white')?.parentElement;if(!host)return null;e=document.createElement('div');e.id='meshwarCmsContact';e.style.cssText='margin-top:9px;color:#cbd5e1;font-size:12px;line-height:1.8';host.appendChild(e);return e}
  function apply(raw){const s={...DEFAULTS,...raw};if(s.site_title)document.title=String(s.site_title);metaDescription().content=String(s.meta_description||'');const fav=safeUrl(s.favicon_url,{hash:false});if(fav)favicon().href=fav;const hero=heroNodes();if(hero.title){hero.title.textContent=String(s.hero_title||'');hero.title.style.whiteSpace='pre-line'}if(hero.subtitle)hero.subtitle.textContent=String(s.hero_subtitle||'');if(hero.primary){hero.primary.textContent=String(s.cta_primary_text||'');hero.primary.dataset.cmsUrl=safeUrl(s.cta_primary_url)||'#orderModal';hero.primary.onclick=e=>{e.preventDefault();navigate(hero.primary.dataset.cmsUrl)}}if(hero.secondary){hero.secondary.textContent=String(s.cta_secondary_text||'');hero.secondary.href=safeUrl(s.cta_secondary_url)||'#localStoresPublic'}const video=document.getElementById('meshwarPromoVideo'),videoUrl=safeUrl(s.video_url,{hash:false});if(video&&videoUrl){const source=video.querySelector('source');if(source)source.src=videoUrl;else video.src=videoUrl;video.poster=safeUrl(s.video_poster,{hash:false})||'';video.load();video.play().catch(()=>{})}const ticker=document.getElementById('meshwarTicker');if(ticker){ticker.style.display=s.is_active&&String(s.announcement_text||'').trim()?'':'none';const track=ticker.querySelector('.meshwar-ticker-track');if(track)track.textContent=String(s.announcement_text||'')}const footer=document.getElementById('meshwarSocialFooter');if(footer){applySocial(socialAnchor(footer,'WhatsApp','whatsapp'),s.whatsapp_url,s.whatsapp_active);applySocial(socialAnchor(footer,'Facebook','facebook-f'),s.facebook_url,s.facebook_active);applySocial(socialAnchor(footer,'Instagram','instagram'),s.instagram_url,s.instagram_active);applySocial(socialAnchor(footer,'Telegram','telegram'),s.telegram_url,s.telegram_active);applySocial(socialAnchor(footer,'TikTok','tiktok'),s.tiktok_url,s.tiktok_active);const parts=[];if(s.support_phone)parts.push('☎ '+escapeHtml(s.support_phone));if(s.support_email)parts.push('✉ '+escapeHtml(s.support_email));if(s.contact_address)parts.push('📍 '+escapeHtml(s.contact_address));const box=contactBox(footer);if(box){box.innerHTML=parts.join('<br>');box.style.display=parts.length?'block':'none'}}}
  async function load(){try{const r=await fetch(`${SB_URL}/rest/v1/settings?select=key,value&key=eq.site_settings&limit=1`,{cache:'no-store',headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`,Accept:'application/json'}});if(!r.ok)throw new Error('site_settings HTTP '+r.status);const rows=await r.json(),row=Array.isArray(rows)?rows[0]:null;if(!row)return;apply(parse(row.value))}catch(e){console.warn('MeshWar CMS settings were not applied; keeping page defaults.',e)}}
  window.loadPublicSiteSettings=load;if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();
