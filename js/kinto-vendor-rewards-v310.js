/* V310 — vendor rewards placeholder, intentionally dormant until secure store-bound RPC is installed. */
(()=>{'use strict';
const KEY='meshwar_vendor_session_v95';
function boot(){
  let session=null;try{session=JSON.parse(sessionStorage.getItem(KEY)||'null')}catch{}
  if(!session?.token)return;
  /* The visual controls are enabled together with the verified vendor RPC.
     Do not write loyalty settings through anon REST or localStorage. */
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();