(()=>{'use strict';
if(!('serviceWorker' in navigator)||!window.isSecureContext)return;
window.addEventListener('load',()=>{
 navigator.serviceWorker.register('./service-worker.js',{scope:'./'}).catch(error=>console.warn('KINTO PWA service worker registration skipped:',error));
},{once:true});
})();