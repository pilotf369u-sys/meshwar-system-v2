(function(){
  'use strict';
  const ID='kintoOfflineScreenV275';
  function ensure(){
    let el=document.getElementById(ID);
    if(el)return el;
    el=document.createElement('div');
    el.id=ID;
    el.setAttribute('role','alert');
    el.setAttribute('aria-live','assertive');
    el.style.cssText='position:fixed;inset:0;z-index:2147483647;background:#0a2f23;display:none;align-items:center;justify-content:center;padding:28px;box-sizing:border-box;direction:rtl;font-family:system-ui,-apple-system,Segoe UI,Tahoma,sans-serif';
    if(!document.getElementById('kintoOfflinePulseStyleV275')){const s=document.createElement('style');s.id='kintoOfflinePulseStyleV275';s.textContent='@keyframes kintoOfflinePulseV275{0%,100%{transform:scale(1);opacity:.88}50%{transform:scale(1.07);opacity:1}}#kintoOfflineLogoV275{animation:kintoOfflinePulseV275 3s ease-in-out infinite;transform-origin:center}';document.head.appendChild(s)}el.innerHTML='<div style="width:min(360px,100%);text-align:center;color:#fff"><img id="kintoOfflineLogoV275" src="images/meshwar-logo.png" alt="KINTO" style="width:112px;height:112px;object-fit:contain;border-radius:50%;margin:0 auto 22px;display:block"><div style="font-size:21px;font-weight:900;margin-bottom:9px">لا يوجد اتصال بالإنترنت</div><div style="font-size:14px;line-height:1.8;opacity:.86;margin-bottom:22px">تحقق من الشبكة ثم حاول مرة أخرى.</div><button type="button" id="kintoOfflineRetryV275" style="border:1px solid rgba(255,215,96,.8);background:#e6b83f;color:#0a2f23;border-radius:14px;padding:11px 24px;font:900 14px system-ui,-apple-system,Segoe UI,Tahoma,sans-serif;cursor:pointer">إعادة المحاولة</button></div>';
    document.body.appendChild(el);
    el.querySelector('#kintoOfflineRetryV275').addEventListener('click',function(){
      if(navigator.onLine)location.reload();
    });
    return el;
  }
  function offline(){ensure().style.display='flex';document.documentElement.dataset.kintoOffline='1'}
  function online(){delete document.documentElement.dataset.kintoOffline;const el=document.getElementById(ID);if(el)el.style.display='none'}
  function init(){navigator.onLine?online():offline()}
  window.addEventListener('offline',offline);
  window.addEventListener('online',online);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  function isKintoApp(){
    return window.matchMedia('(display-mode: standalone)').matches||
      window.matchMedia('(display-mode: fullscreen)').matches||
      String(document.referrer||'').startsWith('android-app://com.kinto.app');
  }
  function syncOrientationGuard(){
    const id='kintoPortraitGuardV275';
    let guard=document.getElementById(id);
    const landscape=window.innerWidth>window.innerHeight;
    if(!isKintoApp()||!landscape){if(guard)guard.remove();return}
    guard=document.createElement('div');
    guard.id=id;
    guard.style.cssText='position:fixed;inset:0;z-index:2147483600;background:#0a2f23;color:#fff;display:grid;place-items:center;padding:28px;box-sizing:border-box;direction:rtl;font-family:system-ui,-apple-system,Segoe UI,Tahoma,sans-serif';
    guard.innerHTML='<div style="text-align:center;max-width:340px"><div style="font-size:34px;margin-bottom:14px">↻</div><div style="font-size:20px;font-weight:900;margin-bottom:8px">استخدم KINTO بالوضع العمودي</div><div style="font-size:14px;line-height:1.8;opacity:.82">أدر الهاتف للوضع العمودي للمتابعة.</div></div>';
    document.body.appendChild(guard);
  }
  window.addEventListener('resize',syncOrientationGuard,{passive:true});
  window.addEventListener('orientationchange',()=>setTimeout(syncOrientationGuard,80),{passive:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',syncOrientationGuard,{once:true});else syncOrientationGuard();
  window.KintoConnectivityV275=Object.freeze({isOffline:()=>!navigator.onLine});
})();