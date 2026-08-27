/* MeshWar Customer Featured Hub v1.1 — active_merchant_slots_view only. */
(()=>{
'use strict';
if(window.__meshwarFeaturedHubV11)return;window.__meshwarFeaturedHubV11=true;
const SB_URL='https://hsmmbloouskqdnptiiad.supabase.co';
const SB_KEY='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[c]));
const pick=(o,...keys)=>{for(const k of keys){if(o&&o[k]!==undefined&&o[k]!==null&&o[k]!=='')return o[k]}return''};
const arr=v=>{if(Array.isArray(v))return v;if(!v)return[];if(typeof v==='object')return[v];try{const x=JSON.parse(v);return Array.isArray(x)?x:(x?[x]:[])}catch{return[]}};
const placeholder='data:image/svg+xml;charset=UTF-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="100%" height="100%" rx="24" fill="#e2e8f0"/><text x="50%" y="52%" text-anchor="middle" font-family="Arial" font-size="24" fill="#64748b">MeshWar</text></svg>');
const slotType=r=>String(pick(r,'slot_type','placement_type','placement','type','section')||'').toLowerCase();
const storeId=r=>String(pick(r,'store_id','merchant_id','local_store_id','vendor_id')||'');
const storeName=r=>pick(r,'store_name','merchant_name','vendor_name','name')||'متجر مميز';
const logo=r=>pick(r,'logo_url','store_logo_url','merchant_logo_url','merchant_logo','store_logo')||placeholder;
const priority=r=>Number(pick(r,'priority','slot_priority','rank','tier_level','weight')||0);
const productFrom=(p,r={})=>({id:pick(p,'id','product_id')||pick(r,'product_id'),name:pick(p,'product_name','name','title')||pick(r,'product_name','title')||'منتج مميز',image:pick(p,'image_url','product_image_url','image','thumbnail_url')||pick(r,'product_image_url','image_url')||placeholder,price:pick(p,'customer_price','price','discount_price','base_price')||pick(r,'product_price','price'),currency:pick(p,'currency')||pick(r,'currency','default_currency')||''});
function embeddedProducts(r){const candidates=[r.products,r.featured_products,r.selected_products,r.product_data,r.items];for(const v of candidates){const a=arr(v);if(a.length)return a.map(x=>productFrom(x,r))}if(pick(r,'product_id','product_name','product_image_url'))return[productFrom({},r)];return[]}
async function rest(path){const res=await fetch(`${SB_URL}/rest/v1/${path}`,{cache:'no-store',headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`,Accept:'application/json'}});if(!res.ok)throw new Error(`Supabase ${res.status}: ${await res.text()}`);return res.json()}
async function storeProducts(id,limit=10){if(!id)return[];try{const q=`local_products?select=id,product_name,image_url,base_price,discount_price&store_id=eq.${encodeURIComponent(id)}&order=created_at.desc&limit=${limit}`;const rows=await rest(q);return(rows||[]).map(x=>productFrom(x))}catch(e){console.warn('Featured hub product fallback failed',e);return[]}}
const productCard=(p,sponsored=false)=>`<article class="mw-product-card ${sponsored?'mw-sponsored-card':''}">${sponsored?'<span class="mw-sponsored-label">إعلان</span>':''}<img src="${esc(p.image||placeholder)}" alt="${esc(p.name)}" loading="lazy" onerror="this.onerror=null;this.src='${esc(placeholder)}'"><div class="mw-product-name">${esc(p.name)}</div>${p.price!==''?`<div class="mw-product-price">${esc(p.price)} ${esc(p.currency)}</div>`:''}</article>`;
const storeCard=r=>`<article class="mw-store-card"><img src="${esc(logo(r))}" alt="${esc(storeName(r))}" loading="lazy" onerror="this.onerror=null;this.src='${esc(placeholder)}'"><div style="min-width:0"><div class="mw-store-name">${esc(storeName(r))}</div><div class="mw-store-medal">★ متجر متميز</div></div></article>`;
function prepareLanding(){
  const legacy=document.querySelector('.header-container');
  if(legacy)legacy.remove();
  const heroSection=document.querySelector('body > nav + section');
  const heroGrid=heroSection?.querySelector(':scope > div:first-child');
  const video=document.getElementById('meshwarVideoAd');
  if(heroGrid&&video&&!heroGrid.contains(video)){
    video.classList.add('mw-hero-video-slot');
    heroGrid.appendChild(video);
  }else if(video){video.classList.add('mw-hero-video-slot')}
}
function mount(){
  prepareLanding();
  let hub=document.getElementById('meshwarFeaturedHub');if(hub)return hub;
  const heroSection=document.querySelector('body > nav + section');
  const ticker=document.getElementById('meshwarTicker');
  hub=document.createElement('section');hub.id='meshwarFeaturedHub';hub.hidden=true;
  if(heroSection?.parentNode)heroSection.insertAdjacentElement('afterend',hub);
  else if(ticker?.parentNode)ticker.parentNode.insertBefore(hub,ticker);
  else document.body.appendChild(hub);
  return hub;
}
async function load(){const hub=mount();try{
  const rows=await rest('active_merchant_slots_view?select=*&limit=100');
  const slots=Array.isArray(rows)?rows:[];
  if(!slots.length){hub.replaceChildren();hub.hidden=true;return}
  const sorted=[...slots].sort((a,b)=>priority(b)-priority(a));
  const heroCandidates=sorted.filter(r=>/hero|banner|premium|top|featured_store/.test(slotType(r)));
  const hero=heroCandidates[0]||sorted[0];
  let heroProducts=embeddedProducts(hero);if(heroProducts.length<2)heroProducts=await storeProducts(storeId(hero),10);
  const featured=sorted.filter(r=>r!==hero&&!/product|sponsor|ad/.test(slotType(r))).slice(0,5);
  const sponsoredRows=sorted.filter(r=>/product|sponsor|ad/.test(slotType(r)));
  let sponsored=sponsoredRows.flatMap(r=>embeddedProducts(r));
  if(!sponsored.length){for(const r of sponsoredRows.slice(0,4)){sponsored.push(...await storeProducts(storeId(r),4))}}
  const heroHtml=`<div class="mw-featured-head"><div><div class="mw-featured-kicker">اختيار MeshWar</div><h2>المتجر المميز</h2></div></div><div class="mw-featured-hero"><div class="mw-featured-store"><img class="mw-featured-logo" src="${esc(logo(hero))}" alt="${esc(storeName(hero))}" onerror="this.onerror=null;this.src='${esc(placeholder)}'"><h3>${esc(storeName(hero))}</h3><span class="mw-featured-badge">★ اشتراك مميز</span></div><div class="mw-scroll-row">${heroProducts.map(p=>productCard(p)).join('')}</div></div>`;
  const storesHtml=featured.length?`<div class="mw-featured-section"><div class="mw-featured-head"><h2>متاجر محلية متميزة</h2><span class="mw-featured-kicker">مختارة لك</span></div><div class="mw-featured-grid">${featured.map(storeCard).join('')}</div></div>`:'';
  const sponsoredHtml=sponsored.length?`<div class="mw-featured-section"><div class="mw-featured-head"><h2>منتجات مدعومة</h2><span class="mw-featured-kicker">إعلانات</span></div><div class="mw-scroll-row">${sponsored.slice(0,20).map(p=>productCard(p,true)).join('')}</div></div>`:'';
  hub.innerHTML=heroHtml+storesHtml+sponsoredHtml;hub.hidden=false;
}catch(e){console.error('Featured merchant hub load error',e);hub.replaceChildren();hub.hidden=true}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();
