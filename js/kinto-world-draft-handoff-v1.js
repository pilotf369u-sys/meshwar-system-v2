// Preserve only a bounded global product draft if the normal dashboard requests login.
(()=>{'use strict';try{const raw=new URLSearchParams(location.hash.slice(1)).get('draft');if(raw&&raw.length<=150000)sessionStorage.setItem('kinto_world_pending_handoff_v1',raw);}catch{}})();
