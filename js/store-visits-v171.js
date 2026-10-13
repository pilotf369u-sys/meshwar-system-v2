/* KINTO V171: optional anonymous store visit beacon; never blocks storefront. */
(()=>{'use strict';
const store=String(window.__KINTO_STORE_ID__||'');
if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(store)||!window.crypto?.randomUUID)return;
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const get=(storage,key)=>{try{let id=storage.getItem(key);if(!/^[0-9a-f-]{36}$/i.test(id||'')){id=crypto.randomUUID();storage.setItem(key,id)}return id}catch{return crypto.randomUUID()}};
const browser=get(localStorage,'kinto_visitor_v171_'+day);
const session=get(sessionStorage,'kinto_store_visit_v171_'+store+'_'+day);
const ad=new URLSearchParams(location.search).get('utm_source')||'';
const api='https://hsmmbloouskqdnptiiad.supabase.co/rest/v1/rpc/kinto_record_store_visit_v171';
const key='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
fetch(api,{method:'POST',keepalive:true,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({p_store_id:store,p_session_id:session,p_browser_id:browser,p_ad_source:ad})}).catch(()=>{});
})();
