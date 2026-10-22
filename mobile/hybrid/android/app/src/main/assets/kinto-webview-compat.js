(()=>{'use strict';
 // Bundled app compatibility only. Never installed in the external shopping process.
 if(location.href!=='about:blank'&&location.origin!=='https://shopkinto.com')return;
 window.print=()=>{location.href='kinto-app://print'};
 const invoice=document.querySelector('.invoice .invoice-head');
 if(invoice&&!document.getElementById('kinto-app-invoice-layout')){
  let viewport=document.querySelector('meta[name="viewport"]');if(!viewport){viewport=document.createElement('meta');viewport.name='viewport';document.head.append(viewport);}viewport.content='width=device-width,initial-scale=1';
  const style=document.createElement('style');style.id='kinto-app-invoice-layout';style.textContent=`
  @media screen and (max-width:640px){
   body:has(.invoice){padding:16px 12px!important;background:#f5f7f5}
   .invoice{width:100%!important;max-width:100%!important;background:#fff;padding:14px;border-radius:10px}
   .invoice .invoice-head{grid-template-columns:minmax(0,1fr)!important;gap:14px!important;padding-bottom:16px;min-height:0}
   .invoice .brand-block{grid-row:1;justify-content:center!important;min-width:0}
   .invoice .order-block{grid-row:2;min-width:0}
   .invoice .date-block{grid-row:3;text-align:center!important;font-size:12px;overflow-wrap:anywhere}
   .invoice .order-status{display:table;margin:8px auto 0;max-width:100%;white-space:normal;font-size:11px}
   .invoice .invoice-barcode{width:min(100%,200px)!important;height:42px!important}
   .invoice .bottom{grid-template-columns:minmax(0,1fr)!important;gap:12px}
   .invoice .card{min-width:0;font-size:12px;line-height:1.6;overflow-wrap:anywhere}
   .invoice .totals div{gap:8px;flex-wrap:wrap}
   .invoice .paid-goods-summary{grid-template-columns:minmax(0,1fr)!important}
   .invoice .paid-goods-summary small,.invoice .paid-goods-summary b{font-size:12px!important;white-space:normal!important}
   .invoice .invoice-payment-note,.invoice .collection-status{font-size:11px!important}
   .invoice .store-total{gap:8px;flex-wrap:wrap;font-size:12px}
   .invoice .store-section{overflow-x:auto;-webkit-overflow-scrolling:touch}
   .invoice table{min-width:540px} .invoice th,.invoice td{font-size:12px;line-height:1.5}
   .invoice .track-step b{font-size:9px;white-space:normal;text-align:center}
  }`;document.head.append(style);
 }
 const video=document.getElementById('meshwarPromoVideo');
 if(!video||video.dataset.kintoAppVideo==='1')return;
 video.dataset.kintoAppVideo='1';
 const restore=async()=>{
  try{
   const r=await fetch('https://hsmmbloouskqdnptiiad.supabase.co/rest/v1/rpc/get_site_settings',{
    method:'POST',cache:'no-store',headers:{apikey:'sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH','Content-Type':'application/json'},body:'{}'
   });
   if(!r.ok)return;
   let settings=await r.json();if(Array.isArray(settings))settings=settings[0];if(typeof settings==='string')settings=JSON.parse(settings);
   if(!settings||settings.hero_media_type==='image'||!settings.video_url)return;
   const url=new URL(settings.video_url,location.href);if(url.protocol!=='https:')return;
   let queued;
   const apply=()=>{
    if(!video.isConnected)return;
    document.getElementById('meshwarVideoFrame')?.classList.remove('kinto-mobile-promo-static');
    video.style.display='block';video.controls=true;video.setAttribute('playsinline','');
    if(video.getAttribute('src')!==url.href){video.setAttribute('src',url.href);video.load();}
   };
   apply();
   new MutationObserver(()=>{clearTimeout(queued);queued=setTimeout(apply,50)}).observe(video,{attributes:true,attributeFilter:['src'],childList:true,subtree:true});
  }catch(e){console.warn('KINTO app video setup unavailable',e)}
 };
 void restore();
})();
