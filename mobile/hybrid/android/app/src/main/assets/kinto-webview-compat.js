(()=>{'use strict';
 // Bundled app compatibility only. Never installed in the external shopping process.
 if(location.href!=='about:blank'&&location.origin!=='https://shopkinto.com')return;
 window.print=()=>{location.href='kinto-app://print'};
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
