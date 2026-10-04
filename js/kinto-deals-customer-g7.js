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
.kd-g7-list{display:grid;grid-template-columns:1fr;gap:8px}
.kd-g7-item{position:relative;isolation:isolate;overflow:hidden;display:grid;grid-template-columns:minmax(90px,23%) minmax(0,1fr) auto;align-items:center;gap:12px;padding:8px;border:1px solid #b69a46;border-radius:11px;background:linear-gradient(110deg,#123d30,#092d24);min-height:110px;max-height:145px;cursor:pointer;text-align:right}
.kd-g7-item:focus-visible{outline:2px solid #f5d478;outline-offset:2px}
.kd-g7-item:after{content:'';position:absolute;z-index:-1;top:0;bottom:0;left:-30%;width:12%;transform:skewX(-22deg);background:linear-gradient(90deg,transparent,rgba(255,225,130,.12),transparent);animation:kdG14Shine 7s ease-in-out infinite;pointer-events:none}
@keyframes kdG14Shine{0%,65%{left:-30%}100%{left:120%}}
.kd-g14-cover{position:relative;width:100%;height:105px;display:grid;place-items:center;overflow:hidden;border-radius:8px;background:#f5f5f2;color:#9b7c37;font-size:27px}
.kd-g14-cover img{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:contain;object-position:center;background:#f5f5f2}
.kd-g14-copy{min-width:0}.kd-g14-copy h3{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.kd-g14-copy p{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;line-height:1.4}
.kd-g14-action{border:1px solid #d4af48;color:#f5d478;border-radius:999px;padding:8px 12px;white-space:nowrap;font-size:12px;font-weight:800}
.kd-g14-backdrop{position:fixed;inset:0;z-index:2147483100;background:#000b;display:grid;place-items:center;padding:14px}
.kd-g14-modal{width:min(600px,100%);max-height:85dvh;overflow:auto;background:#092e25;border:1px solid #d4af48;border-radius:15px;padding:16px;color:#fff}
.kd-g14-modal header{display:flex;justify-content:space-between;gap:10px;align-items:center}.kd-g14-modal button{background:#173d30;color:#fff;border:1px solid #d4af48;border-radius:8px;padding:7px 12px;cursor:pointer}
.kd-g14-modal img{display:block;width:100%;height:100%;max-height:230px;object-fit:contain;object-position:center;background:#f5f5f2;border-radius:8px;margin:12px 0}.kd-g14-products{display:grid;grid-template-columns:repeat(auto-fill,minmax(105px,1fr));gap:7px;margin:10px 0}.kd-g14-product{border:1px solid #54705b;border-radius:8px;padding:6px;min-width:0;background:#143b2e;font-size:11px}.kd-g14-product img{width:100%;height:76px;object-fit:contain;background:#f5f5f2;margin:0 0 5px}.kd-g14-gift{border:1px solid #c7a44b;border-radius:9px;padding:8px;margin:10px 0;background:#1b4435}.kd-g14-gift img{width:84px;height:70px;object-fit:contain;background:#f5f5f2;margin:5px 0}.kd-g14-modal p{white-space:pre-wrap;line-height:1.7;overflow-wrap:anywhere}
@media(max-width:650px){#kintoMerchantDealsG7{padding:8px;margin:9px auto}#kintoMerchantDealsG7 h2{font-size:15px;margin-bottom:7px}.kd-g7-item{grid-template-columns:86px minmax(0,1fr);gap:8px;min-height:104px;max-height:none}.kd-g14-cover{height:90px}.kd-g14-copy h3{font-size:12px}.kd-g14-copy p{font-size:10px;-webkit-line-clamp:2}.kd-g14-action{grid-column:2;grid-row:2;justify-self:start;align-self:center;padding:4px 9px;font-size:10px;margin:0}.kd-g7-item{grid-template-rows:auto auto}.kd-g14-cover{grid-row:1 / span 2;align-self:center}.kd-g14-copy{grid-column:2;grid-row:1}.kd-g14-copy h3{margin-bottom:3px}.kd-g14-copy p{margin-bottom:3px}}
@media(prefers-reduced-motion:reduce){.kd-g7-item:after{animation:none}}
.kd-g7-item h3{margin:0 0 6px;font-size:16px;color:#f2ce73}\n.kd-g13-ad{display:block;width:100%;height:100%;object-fit:contain;background:#f5f5f2;border-radius:8px}
.kd-g7-item p{margin:0 0 7px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}
.kd-g7-item small{color:#c5d5cd}

/* G14B layout correction: horizontal compact desktop dialog and responsive mobile. */
.kd-g14-modal{width:min(1060px,96vw);max-height:94dvh;overflow:auto;padding:12px 16px;direction:rtl}
.kd-g14-modal header{position:sticky;top:-12px;z-index:3;background:#092e25;padding:5px 0 9px}
.kd-g14-modal header h3{margin:0;font-size:17px;color:#f5d478}
.kd-g14-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(180px,28%);gap:16px;align-items:start}
.kd-g14-info{min-width:0}.kd-g14-side{min-width:0}
.kd-g14-side .kd-g14-photo{height:145px;background:#f5f5f2;border-radius:9px;overflow:hidden;display:none}
.kd-g14-side .kd-g14-photo:has(img){display:block}
.kd-g14-side .kd-g14-photo img{width:100%;height:100%;object-fit:contain;margin:0;max-height:none}
.kd-g14-modal p{margin:5px 0;line-height:1.45;font-size:12px}
.kd-g14-modal h4{font-size:13px;margin:9px 0 5px!important}
.kd-g14-products{grid-template-columns:repeat(auto-fill,minmax(102px,1fr));gap:6px;margin:5px 0}
.kd-g14-product{font-size:10px;text-align:center}
.kd-g14-product img{height:65px;margin:0 0 3px}
.kd-g14-gift{padding:5px;margin:5px 0;display:flex;align-items:center;gap:8px}
.kd-g14-gift .kd-g14-product{display:flex;align-items:center;gap:8px;border:0;background:none;text-align:right}
.kd-g14-gift .kd-g14-product img{width:62px;height:54px;margin:0}
.kd-g14-mini{display:flex;gap:5px;margin-top:5px;align-items:center;overflow:hidden}
.kd-g14-mini img{width:34px;height:34px;flex:none;object-fit:contain;background:#f5f5f2;border-radius:5px}
.kd-g14-mini span{font-size:10px;color:#f5d478}
.kd-g14-copy{min-width:0}
@media(min-width:651px){.kd-g7-item{grid-template-columns:minmax(90px,18%) minmax(0,1fr) auto;max-height:none}.kd-g14-copy p{-webkit-line-clamp:1}}
@media(max-width:650px){.kd-g14-modal{width:100%;max-height:94dvh;padding:10px}.kd-g14-layout{grid-template-columns:minmax(0,1fr)}.kd-g14-side{display:contents}.kd-g14-side .kd-g14-photo{display:none!important}.kd-g14-products{grid-template-columns:repeat(3,minmax(0,1fr))}.kd-g14-product img{height:58px}.kd-g7-item .kd-g14-copy h3{font-size:12px}.kd-g7-item .kd-g14-copy p{font-size:10px}.kd-g14-mini img{width:27px;height:27px}}

/* G14B refinement: gift has its own prominent real thumbnail, ten products fit in two desktop rows. */
.kd-g14-modal{width:min(1260px,98vw);max-width:98vw}
.kd-g14-layout{grid-template-columns:minmax(0,1fr) minmax(165px,21%);gap:12px}
.kd-g14-products{grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}
.kd-g14-product{min-width:0;overflow:hidden}
.kd-g14-product img{height:60px}
.kd-g14-mini{overflow:visible;flex-wrap:wrap;gap:5px}
.kd-g14-mini .kd-g14-gift-preview{display:inline-flex;align-items:center;gap:5px;border:1px solid #f0c45b;border-radius:7px;padding:3px 6px;background:#234b36;color:#ffdc78;font-weight:800;font-size:11px;white-space:nowrap}
.kd-g14-mini .kd-g14-gift-preview img{width:42px;height:42px;object-fit:contain;border:1px solid #f0c45b;background:#f5f5f2}
.kd-g14-mini .kd-g14-gift-preview strong{font-size:11px}
@media(max-width:850px){.kd-g14-modal{width:98vw}.kd-g14-layout{grid-template-columns:minmax(0,1fr) minmax(140px,24%)}.kd-g14-products{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media(max-width:650px){.kd-g14-modal{width:100%;max-width:100%;padding:9px}.kd-g14-layout{grid-template-columns:minmax(0,1fr)}.kd-g14-products{grid-template-columns:repeat(3,minmax(0,1fr))}.kd-g14-mini .kd-g14-gift-preview{padding:2px 4px;font-size:10px}.kd-g14-mini .kd-g14-gift-preview img{width:32px;height:32px}.kd-g14-mini{gap:4px}}
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
function store(rows){if(!storeId)return;const hero=document.querySelector('.store-hero'),panel=document.getElementById('localStoreProductsPanel');if(!hero||!panel||!rows.length)return;const section=document.createElement('section');section.id='kintoMerchantDealsG7';section.setAttribute('aria-label','عروض المتجر المنشورة');const h=document.createElement('h2');h.textContent='✦ عروض المتجر';const list=document.createElement('div');list.className='kd-g7-list';
const url=r=>'https://hsmmbloouskqdnptiiad.supabase.co/functions/v1/kinto-deals-ad-public-g13?campaign_id='+encodeURIComponent(r.campaign_id);
function image(r,frame){const img=document.createElement('img');img.className='kd-g13-ad';img.alt='إعلان '+String(r.title).slice(0,100);img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';img.onerror=()=>img.remove();img.onload=()=>{if(frame.classList.contains('kd-g14-cover'))frame.firstChild?.nodeType===3&&frame.firstChild.remove()};img.src=url(r);frame.append(img)}
const detailCache=new Map();
async function getDetail(r){if(detailCache.has(r.campaign_id))return detailCache.get(r.campaign_id);const request=fetch('https://hsmmbloouskqdnptiiad.supabase.co/rest/v1/rpc/kinto_deals_v1_public_detail_g14',{method:'POST',cache:'no-store',headers:{apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json'},body:JSON.stringify({p_campaign_id:r.campaign_id})}).then(async response=>{if(!response.ok)throw Error('DETAIL_UNAVAILABLE');const data=await response.json();if(!data||data.campaign_id!==r.campaign_id)throw Error('NOT_PUBLISHED');return data}).catch(e=>{detailCache.delete(r.campaign_id);throw e});detailCache.set(r.campaign_id,request);return request}
function productCard(p){const box=document.createElement('div');box.className='kd-g14-product';if(p.image_url){const pic=document.createElement('img');pic.src=p.image_url;pic.alt=p.name||'صورة منتج';pic.loading='lazy';pic.onerror=()=>pic.remove();box.append(pic)}const name=document.createElement('div');name.textContent=p.name||'منتج';box.append(name);return box}
function details(r,previous){
 const backdrop=document.createElement('div');backdrop.className='kd-g14-backdrop';
 const dialog=document.createElement('section');dialog.className='kd-g14-modal';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label','تفاصيل حملة '+r.title);
 const header=document.createElement('header'),title=document.createElement('h3'),close=document.createElement('button');title.textContent=r.title;close.type='button';close.textContent='إغلاق ×';header.append(title,close);dialog.append(header);
 const layout=document.createElement('div');layout.className='kd-g14-layout';
 const info=document.createElement('div');info.className='kd-g14-info';
 const side=document.createElement('aside');side.className='kd-g14-side';
 const photo=document.createElement('div');photo.className='kd-g14-photo';side.append(photo);
 // Never leave a large empty white panel if this campaign has no uploaded advertisement.
 const ad=document.createElement('img');ad.alt='إعلان '+r.title;ad.loading='lazy';ad.onerror=()=>{photo.replaceChildren();photo.style.display='none'};ad.onload=()=>{photo.style.display='block'};ad.src=url(r);photo.append(ad);
 if(r.description){const p=document.createElement('p');p.textContent=r.description;side.append(p)}
 const until=document.createElement('small');until.textContent='متاح حتى '+new Date(r.ends_at).toLocaleDateString('ar-IQ');side.append(until);
 const content=document.createElement('div');content.textContent='جارٍ تحميل تفاصيل الحملة...';content.setAttribute('aria-live','polite');info.append(content);layout.append(info,side);dialog.append(layout);
 getDetail(r).then(data=>{if(!content.isConnected)return;content.replaceChildren();
 const heading=(label)=>{const h=document.createElement('h4');h.textContent=label;h.style.color='#f5d478';content.append(h)};
 if(data.gift){heading('🎁 الهدية المحددة');const gift=document.createElement('div');gift.className='kd-g14-gift';gift.append(productCard(data.gift));content.append(gift)}
 const kinds={choose_n:'اختر '+data.threshold_units+' من المنتجات المشمولة',buy_n:'اشترِ '+data.threshold_units+' من نفس المنتج',limited_purchase:'عرض بكمية محدودة لكل عميل'};heading(kinds[data.kind]||'المنتجات المشمولة');
 const grid=document.createElement('div');grid.className='kd-g14-products';for(const p of data.products||[])grid.append(productCard(p));if(!grid.children.length)grid.textContent='لا توجد منتجات متاحة للعرض';content.append(grid);
 heading('شروط الحملة');const limits=document.createElement('p');const lines=['عدد مرات الاستفادة لكل عميل: '+data.max_uses_per_customer];if(data.max_units_per_customer)lines.push('الحد الأقصى للوحدات لكل عميل: '+data.max_units_per_customer);if(data.max_total_redemptions)lines.push('إجمالي مرات الاستفادة المحدد: '+data.max_total_redemptions);limits.textContent=lines.join(' • ');content.append(limits);
 if(data.terms_snapshot&&Object.keys(data.terms_snapshot).length){const terms=document.createElement('details');const summary=document.createElement('summary');summary.textContent='الشروط الإضافية';terms.append(summary);const pre=document.createElement('pre');pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;font-size:11px';pre.textContent=Object.entries(data.terms_snapshot).map(([k,v])=>k+': '+(typeof v==='object'?JSON.stringify(v):v)).join('\\n');terms.append(pre);content.append(terms)}
 const disclaimer=document.createElement('small');disclaimer.textContent='للعرض فقط؛ لا تعديل للسلة أو الطلب.';content.append(disclaimer)
 }).catch(()=>{if(content.isConnected)content.textContent='تعذر تحميل التفاصيل. قد تكون الحملة لم تعد منشورة.'});
 backdrop.append(dialog);function dismiss(){backdrop.remove();document.removeEventListener('keydown',keys);previous?.focus?.()}function keys(e){if(e.key==='Escape')dismiss();if(e.key==='Tab'){e.preventDefault();close.focus()}}close.addEventListener('click',dismiss);backdrop.addEventListener('click',e=>{if(e.target===backdrop)dismiss()});document.addEventListener('keydown',keys);document.body.append(backdrop);close.focus()
}
for(const r of rows){const card=document.createElement('article');card.className='kd-g7-item';card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label','تفاصيل حملة '+r.title);const cover=document.createElement('div');cover.className='kd-g14-cover';cover.textContent='✦';image(r,cover);card.append(cover);const copy=document.createElement('div');copy.className='kd-g14-copy';const title=document.createElement('h3');title.textContent=String(r.title).slice(0,140);copy.append(title);if(r.description){const p=document.createElement('p');p.textContent=String(r.description).slice(0,250);copy.append(p)}const date=document.createElement('small');date.textContent='متاح حتى '+new Date(r.ends_at).toLocaleDateString('ar-IQ');copy.append(date);
const mini=document.createElement('div');mini.className='kd-g14-mini';copy.append(mini);
getDetail(r).then(data=>{if(!mini.isConnected)return;mini.replaceChildren();const products=(data.products||[]).slice(0,4);for(const p of products){if(!p.image_url)continue;const pic=document.createElement('img');pic.src=p.image_url;pic.alt=p.name||'منتج مشمول';pic.loading='lazy';pic.onerror=()=>pic.remove();mini.append(pic)}const remaining=(data.products||[]).length-products.length;if(remaining>0){const more=document.createElement('span');more.textContent='+'+remaining;mini.append(more)}if(data.gift){const gift=document.createElement('span');gift.className='kd-g14-gift-preview';const label=document.createElement('strong');label.textContent='🎁 الهدية';gift.append(label);if(data.gift.image_url){const pic=document.createElement('img');pic.src=data.gift.image_url;pic.alt=data.gift.name||'صورة الهدية';pic.loading='lazy';pic.onerror=()=>pic.remove();gift.append(pic)}mini.prepend(gift)}}).catch(()=>mini.remove());
card.append(copy);const action=document.createElement('span');action.className='kd-g14-action';action.textContent='عرض التفاصيل ‹';card.append(action);card.addEventListener('click',()=>details(r,card));card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();details(r,card)}});list.append(card)}section.append(h,list);hero.insertAdjacentElement('afterend',section)}
feed().then(rows=>{if(isDirectory)directory(rows);else store(rows.filter(r=>String(r.store_id)===String(storeId)))}).catch(()=>{});
})();
