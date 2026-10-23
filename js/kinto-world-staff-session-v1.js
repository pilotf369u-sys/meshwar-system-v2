(()=>{'use strict';const key='kinto_world_staff_session_v1';
 function read(){try{const s=JSON.parse(sessionStorage.getItem(key)||'null');if(!s?.token||!Number.isFinite(Date.parse(s.expiresAt))||Date.parse(s.expiresAt)<=Date.now()){sessionStorage.removeItem(key);return null;}return s;}catch{return null;}}
 function save(data){sessionStorage.setItem(key,JSON.stringify({token:data.session_token,expiresAt:data.expires_at}));}
 window.KintoWorldStaffSessionV1={read,save,clear:()=>sessionStorage.removeItem(key)};
})();
