(function(global){
  'use strict';
  const STORAGE_KEY='kinto_customer_review_session_v132';
  const APP_STORAGE_KEY='kinto_customer_app_session_v275';
  const LOGGED_OUT_KEY='kinto_customer_logged_out_v150';
  function clearSession(){
    sessionStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(APP_STORAGE_KEY);
  }
  function read(){
    try{
      if(localStorage.getItem(LOGGED_OUT_KEY)==='1'){clearSession();return null}
      const raw=sessionStorage.getItem(STORAGE_KEY)||localStorage.getItem(APP_STORAGE_KEY)||'null';
      const value=JSON.parse(raw);
      if(!value?.token)return null;
      if(value.expiresAt&&Date.parse(value.expiresAt)<=Date.now()){clearSession();return null}
      /* Keep the verified customer token available after an Android app process restart.
       * The server-side session expiry remains authoritative; logout clears both stores. */
      if(!sessionStorage.getItem(STORAGE_KEY))sessionStorage.setItem(STORAGE_KEY,JSON.stringify(value));
      if(!localStorage.getItem(APP_STORAGE_KEY))localStorage.setItem(APP_STORAGE_KEY,JSON.stringify(value));
      return value;
    }catch{clearSession();return null}
  }
  function save(token,expiresAt){
    localStorage.removeItem(LOGGED_OUT_KEY);
    const value=JSON.stringify({token:String(token),expiresAt:expiresAt||new Date(Date.now()+30*86400000).toISOString()});
    sessionStorage.setItem(STORAGE_KEY,value);
    localStorage.setItem(APP_STORAGE_KEY,value);
  }
  async function identity(supabase){
    const session=read();
    if(!session)return null;
    const {data,error}=await supabase.rpc('customer_session_identity_v150',{p_session_token:session.token});
    if(error||!data?.ok||!data?.customer){clearSession();return null}
    return data.customer;
  }
  async function logout(supabase){
    const session=read();
    localStorage.setItem(LOGGED_OUT_KEY,'1');
    clearSession();
    if(!session)return;
    try{await supabase.rpc('customer_review_logout_v132',{p_session_token:session.token})}catch{}
  }
  global.KintoCustomerSessionV150=Object.freeze({read,save,identity,logout});
})(window);
