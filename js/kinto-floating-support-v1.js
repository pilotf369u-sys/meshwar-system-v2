/* KINTO support launcher, presentation only. */
(()=>{'use strict';
if(window.KintoFloatingSupportV1)return;
const prefix='kinto-support-v1',base='مرحبا، أحتاج مساعدة من فريق KINTO.';
const routes=['index.html','local-stores.html','global-stores.html','store.html','dashboard.html'];
if(!routes.includes(location.pathname.split('/').pop()||'index.html'))return;
const topics=[['general','❔','سؤال عام بخصوص المنصة','🟢 استفسار عام عن المنصة'],['local','🏬','طلب من متجر محلي','🏬 الطلبات المحلية'],['global','🌍','طلب من متجر عالمي','🌍 الطلبات العالمية']];
let number='',button,overlay,start,dragged=false;
const css=document.createElement('style');
css.textContent='#kinto-support-v1-button{position:fixed;left:12px;bottom:calc(95px + env(safe-area-inset-bottom,0px));width:44px;height:44px;border:1px solid #dabf76;border-radius:50%;background:#25d366;color:white;z-index:2147482000;display:grid;place-items:center;padding:11px;box-shadow:0 4px 14px #0005;cursor:grab;touch-action:none}#kinto-support-v1-button svg{width:100%;height:100%;fill:currentColor}#kinto-support-v1-overlay{position:fixed;inset:0;background:#0009;z-index:2147483100;display:grid;place-items:center;padding:16px}#kinto-support-v1-panel{width:min(390px,100%);box-sizing:border-box;border:1px solid #d4b456;border-radius:18px;padding:18px;background:#0a2f23;color:#fff;direction:rtl;box-shadow:0 18px 45px #0008;font-family:inherit}#kinto-support-v1-panel h2{font-size:19px;margin:0 0 8px}#kinto-support-v1-panel p{margin:0 0 14px;font-size:14px}#kinto-support-v1-panel button{font-family:inherit;cursor:pointer}#kinto-support-v1-panel .kinto-support-choice{display:flex;align-items:center;gap:12px;width:100%;padding:13px;margin:8px 0;color:white;border:1px solid #50715d;background:#164535;border-radius:12px;text-align:right;font-size:14px}#kinto-support-v1-panel .kinto-support-close{float:left;border:none;background:transparent;color:white;font-size:25px}#kinto-support-v1-panel .kinto-support-emoji{font-size:24px}#kinto-support-v1-button:focus-visible,#kinto-support-v1-panel button:focus-visible{outline:3px solid gold;outline-offset:3px}@media(min-width:769px){#kinto-support-v1-button{bottom:24px;left:22px}}@media(max-width:768px){body:has([role=dialog]:not(#kinto-support-v1-panel):not(.kinto-product-dialog)) #kinto-support-v1-button{visibility:hidden}}';
document.head.append(css);
const icon='<svg viewBox="0 0 448 512" aria-hidden="true"><path d="M380.9 97.1C339-44.9 123.4-29.8 53.7 91.1-5.7 193.8 17.1 323.3 57.8 366.5L32 480l116.2-30.4c139.4 68.6 291.3-34.9 291.3-189 0-62.1-24.2-120.5-68.6-163.5zM224 23C101 23 1 122.9 1 245.9c0 39.3 10.3 77.7 29.9 111.6L0 470l115.2-30.2c32.8 17.8 69.8 27.1 108.6 27.1h.1c122.9 0 223.9-100 223.9-223S346.9 23 224 23zm0 404.5c-35.2 0-69.6-9.5-99.5-27.4l-7.1-4.2-68.2 17.9 18.2-66.5-4.6-7.3c-19.5-31.1-29.8-67-29.8-104.1 0-105.4 85.8-191.2 191.3-191.2 105.5 0 191.2 85.8 191.2 191.2S329.4 427.5 224 427.5zm105-143.2c-5.7-2.9-33.7-16.6-38.9-18.5-5.2-1.9-9-2.9-12.8 2.9-3.8 5.7-14.7 18.5-18 22.3-3.3 3.8-6.6 4.3-12.3 1.4-5.7-2.9-24.1-8.9-45.9-28.3-17-15.1-28.5-33.7-31.8-39.4-3.3-5.7-.4-8.8 2.5-11.7 2.6-2.6 5.7-6.7 8.6-10 2.9-3.3 3.8-5.7 5.7-9.5 1.9-3.8 1-7.1-.5-10-1.4-2.9-12.8-30.9-17.5-42.3-4.6-11.1-9.4-9.6-12.8-9.8-3.3-.2-7.1-.2-10.9-.2s-10 1.4-15.2 7.1c-5.2 5.7-19.9 19.5-19.9 47.5s20.4 55.1 23.3 58.9c2.9 3.8 40.1 61.2 97.2 85.8 13.6 5.9 24.3 9.4 32.6 12 13.7 4.4 26.1 3.8 35.9 2.3 10.9-1.6 33.7-13.8 38.5-27.1 4.8-13.3 4.8-24.7 3.3-27.1-1.4-2.4-5.2-3.8-10.9-6.7z"/></svg>';
function parse(v){if(Array.isArray(v))return parse(v[0]);if(typeof v==='string'){try{return parse(JSON.parse(v))}catch{return{}}}if(v&&typeof v==='object')return v.value!=null?parse(v.value):v;return{}}
function phone(settings){
 if(settings.whatsapp_active!==true&&String(settings.whatsapp_active)!=='true')return'';
 const valid=value=>{const digits=String(value||'').replace(/\D/g,'').replace(/^00/,'');return /^[1-9][0-9]{8,14}$/.test(digits)?digits:''};
 const primary=valid(settings.support_phone);if(primary)return primary;
 try{
  const u=new URL(String(settings.whatsapp_url||''));
  if(u.protocol!=='https:'||!/(^|\.)(wa\.me|whatsapp\.com)$/i.test(u.hostname))return'';
  const supplied=u.searchParams.get('phone')||(u.hostname.toLowerCase()==='wa.me'?u.pathname.split('/').filter(Boolean)[0]:'');
  return valid(supplied);
 }catch{return''}
}
function close(){overlay?.remove();overlay=null;button?.focus()}
function open(){if(!number||overlay)return;overlay=document.createElement('div');overlay.id=prefix+'-overlay';const panel=document.createElement('section');panel.id=prefix+'-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','مساعدة KINTO');const exit=document.createElement('button');exit.className='kinto-support-close';exit.type='button';exit.textContent='×';exit.setAttribute('aria-label','إغلاق');exit.onclick=close;panel.append(exit);const title=document.createElement('h2');title.textContent='مساعدة KINTO';const intro=document.createElement('p');intro.textContent='مرحباً، كيف يمكننا مساعدتك؟';panel.append(title,intro);topics.forEach(t=>{const b=document.createElement('button');b.type='button';b.className='kinto-support-choice';const i=document.createElement('span');i.className='kinto-support-emoji';i.innerHTML=t[1]==='❔'?'<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>':t[1]==='🏬'?'<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 9 2-5h14l2 5"/><path d="M4 9v11h16V9M9 20v-7h6v7"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/></svg>':'<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/></svg>';const name=document.createElement('span');name.textContent=t[2];b.append(i,name);b.onclick=()=>{const url='https://wa.me/'+number+'?text='+encodeURIComponent(base+'\n'+t[3]);close();window.open(url,'_blank','noopener,noreferrer')};panel.append(b)});overlay.append(panel);overlay.onclick=e=>{if(e.target===overlay)close()};document.body.append(overlay);exit.focus()}
function move(x,y){const bottomNav=document.getElementById('kintoMobileAppNav');const navTop=bottomNav&&getComputedStyle(bottomNav).display!=='none'?bottomNav.getBoundingClientRect().top:innerHeight;const maxY=Math.max(8,Math.min(innerHeight-54,navTop-54));button.style.left=Math.max(8,Math.min(innerWidth-54,x))+'px';button.style.top=Math.max(8,Math.min(maxY,y))+'px';button.style.bottom='auto'}
function mount(){button=document.createElement('button');button.id=prefix+'-button';button.type='button';button.setAttribute('aria-label','مساعدة KINTO عبر واتساب');button.innerHTML=icon;document.body.append(button);let saved;try{saved=JSON.parse(localStorage.getItem(prefix+'-position')||'null')}catch{}if(saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y))move(saved.x*innerWidth,saved.y*innerHeight);
button.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;start={x:e.clientX,y:e.clientY,left:button.getBoundingClientRect().left,top:button.getBoundingClientRect().top};dragged=false;button.setPointerCapture(e.pointerId)});
button.addEventListener('pointermove',e=>{if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;if(Math.hypot(dx,dy)>7)dragged=true;if(dragged)move(start.left+dx,start.top+dy)});
button.addEventListener('pointerup',()=>{if(!start)return;start=null;if(dragged){const r=button.getBoundingClientRect();move(r.left+r.width/2<innerWidth/2?10:innerWidth-r.width-10,r.top);const n=button.getBoundingClientRect();try{localStorage.setItem(prefix+'-position',JSON.stringify({x:n.left/innerWidth,y:n.top/innerHeight}))}catch{}button.dataset.dragged='1'}});
button.onclick=()=>{if(button.dataset.dragged){delete button.dataset.dragged;return}open()};
window.addEventListener('resize',()=>{if(button.style.top){const r=button.getBoundingClientRect();move(r.left,r.top)}});document.addEventListener('keydown',e=>{if(e.key==='Escape')close()})}
async function init(){
 try{
  const get=window.ensureCustomerPortalSupabase||window.ensureMainSupabase||window.ensureKintoSupabase;
  let settings;
  const sb=typeof get==='function'?await get():window.KintoSupabaseReady?await window.KintoSupabaseReady:window.KintoSupabase;
  if(sb?.rpc){const {data,error}=await sb.rpc('get_site_settings');if(error)throw error;settings=parse(data)}
  else{
   // Public CMS read fallback for storefronts without a global Supabase client.
   const url='https://hsmmbloouskqdnptiiad.supabase.co/rest/v1/rpc/get_site_settings';
   const key='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
   const response=await fetch(url,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:'{}',cache:'no-store'});
   if(!response.ok)throw Error('CMS_SUPPORT_UNAVAILABLE');
   settings=parse(await response.json());
  }
  number=phone(settings);if(number)mount();
 }catch(e){console.warn('KINTO floating support unavailable',e)}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();window.KintoFloatingSupportV1=Object.freeze({topics:topics.map(t=>t[0])});
})();