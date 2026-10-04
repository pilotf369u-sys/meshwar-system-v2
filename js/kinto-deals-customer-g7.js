/* G7: merchant deals public DISPLAY ONLY; no coupon/cart/checkout dependencies. */
(()=>{'use strict';
const URL='https://hsmmbloouskqdnptiiad.supabase.co/rest/v1/rpc/kinto_deals_v1_public_feed_g7';
const KEY='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
const storeId=new URLSearchParams(location.search).get('storeId');
const isStore=/\/store\.html$/i.test(location.pathname);
const isDirectory=/\/local-stores\.html$/i.test(location.pathname);
if(!isStore&&!isDirectory)return;
const css=document.createElement('style');css.id='kintoMerchantDealsG7Style';css.textContent=`
.kd-g7-badge{display:inline-flex;align-items:center;background:#b58a22;color:#092e24;border:1px solid #f4d57c;border-radius:999px;padding:3px 10px;font-size:11px;font-weight:800;line-height:1.5;margin:5px}
#kintoMerchantDealsG7{margin:14px auto;padding:15px;border:1px solid #ad8a37;border-radius:15px;background:linear-gradient(130deg,#123d31,#092e25);color:#fff;max-width:1200px}
#kintoMerchantDealsG7 h2{margin:0 0 12px;font-size:19px;color:#f2ce73}
.kd-g7-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:10px}
.kd-g7-item{padding:12px;border:1px solid #6c653f;border-radius:11px;background:#12372d}
.kd-g7-item h3{margin:0 0 6px;font-size:16px;color:#f2ce73}\n.kd-g13-ad{display:block;width:100%;aspect-ratio:16/9;object-fit:contain;background:#08271f;border-radius:8px;margin:0 0 9px}
.kd-g7-item p{margin:0 0 7px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}
.kd-g7-item small{color:#c5d5cd}
`;document.head.append(css);
const live=()=>new Date();
const valid=r=>r&&r.campaign_id&&r.store_id&&r.title&&r.starts_at&&r.ends_at&&new Date(r.starts_at)<=live()&&new Date(r.ends_at)>live();
async function feed(){try{const r=await fetch(URL,{method:'POST',cache:'no-store',headers:{apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json'},body:JSON.stringify({p_store_id:isStore?storeId:null})});if(!r.ok)return[];const data=await r.json();return Array.isArray(data)?data.filter(valid):[]}catch{return[]}}
function badge(){const x=document.createElement('span');x.className='kd-g7-badge';x.textContent='✦ عروض';x.setAttribute('aria-label','توجد عروض منشورة لهذا المتجر');return x}
function directory(rows){const eligible=new Set(rows.map(r=>String(r.store_id)));const root=document.getElementById('storesGrid');const spotlight=document.getElementById('kintoOfficialStoreSpotlight');if(!root&&!spotlight)return;let busy=false;
function paint(){if(busy)return;busy=true;try{
 for(const card of root?root.querySelectorAll('article.card'):[]){const a=card.querySelector('a[href*="storeId="]');let id=card.dataset.kintoStoreId||'';if(!id)try{id=new URL(a?.getAttribute('href')||'',location.href).searchParams.get('storeId')||''}catch{}const old=card.querySelector('.kd-g7-badge');if(eligible.has(id)){if(!old)card.insertBefore(badge(),card.firstChild)}else old?.remove()}
 if(spotlight){const a=spotlight.querySelector('a[href*="storeId="]');let id=spotlight.dataset.kintoStoreId||'';if(!id)try{id=new URL(a?.getAttribute('href')||'',location.href).searchParams.get('storeId')||''}catch{}const old=spotlight.querySelector('.kd-g7-badge');if(eligible.has(id)){if(!old)spotlight.insertBefore(badge(),spotlight.firstChild)}else old?.remove()}
}finally{busy=false}}
paint();for(const el of [root,spotlight])if(el)new MutationObserver(()=>queueMicrotask(paint)).observe(el,{childList:true,subtree:true});
}
function store(rows){if(!storeId)return;const hero=document.querySelector('.store-hero');const panel=document.getElementById('localStoreProductsPanel');if(!hero||!panel||!rows.length)return;const section=document.createElement('section');section.id='kintoMerchantDealsG7';section.setAttribute('aria-label','عروض المتجر المنشورة');const h=document.createElement('h2');h.textContent='✦ عروض المتجر';const list=document.createElement('div');list.className='kd-g7-list';for(const r of rows){const card=document.createElement('article');card.className='kd-g7-item';const title=document.createElement('h3');title.textContent=String(r.title).slice(0,140);card.append(title);const img=document.createElement('img');img.className='kd-g13-ad';img.alt='صورة إعلان '+String(r.title).slice(0,100);img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';img.addEventListener('error',()=>img.remove(),{once:true});img.src='https://hsmmbloouskqdnptiiad.supabase.co/functions/v1/kinto-deals-ad-public-g13?campaign_id='+encodeURIComponent(r.campaign_id);card.append(img);if(r.description){const p=document.createElement('p');p.textContent=String(r.description).slice(0,500);card.append(p)}const date=document.createElement('small');date.textContent='متاح حتى '+new Date(r.ends_at).toLocaleDateString('ar-IQ');card.append(date);list.append(card)}section.append(h,list);hero.insertAdjacentElement('afterend',section)}
feed().then(rows=>{if(isDirectory)directory(rows);else store(rows.filter(r=>String(r.store_id)===String(storeId)))}).catch(()=>{});
})();
