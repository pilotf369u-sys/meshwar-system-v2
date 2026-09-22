(function adminSessionV147Bootstrap(global){
  'use strict';
  const STORAGE_KEY='kinto_admin_session_v147';
  function normalize(value){
    if(!value||typeof value!=='object')return null;
    const token=String(value.token||value.session_token||'').trim();
    const expiresAt=String(value.expiresAt||value.expires_at||'').trim();
    if(!token||!expiresAt||!Number.isFinite(Date.parse(expiresAt)))return null;
    return {token,expiresAt,admin:value.admin&&typeof value.admin==='object'?value.admin:null};
  }
  function read(){
    try{const value=normalize(JSON.parse(sessionStorage.getItem(STORAGE_KEY)||'null'));if(!value||Date.parse(value.expiresAt)<=Date.now()){sessionStorage.removeItem(STORAGE_KEY);return null}return value}
    catch{sessionStorage.removeItem(STORAGE_KEY);return null}
  }
  function save(payload){const value=normalize(payload);if(!value)throw new Error('ADMIN_SESSION_INVALID_PAYLOAD');sessionStorage.setItem(STORAGE_KEY,JSON.stringify(value));return value}
  function clear(){sessionStorage.removeItem(STORAGE_KEY)}
  async function login(supabase,identity,password){
    const {data,error}=await supabase.rpc('admin_login_v147',{p_identity:String(identity||'').trim(),p_password:String(password||'')});
    if(error)throw error;
    if(!data?.ok||!data?.session_token)return {ok:false,error:String(data?.error||'ADMIN_LOGIN_INVALID'),retryAfterSeconds:Number(data?.retry_after_seconds||0)};
    const session=save({token:data.session_token,expiresAt:data.expires_at,admin:data.admin});
    return {ok:true,session,admin:data.admin||null};
  }
  async function identity(supabase){
    const session=read();if(!session)throw new Error('ADMIN_SESSION_REQUIRED');
    const {data,error}=await supabase.rpc('admin_session_identity_v147',{p_session_token:session.token});
    if(error||!data?.ok||!data?.admin){clear();throw error||new Error('ADMIN_SESSION_INVALID')}
    save({...session,admin:data.admin});return data.admin;
  }
  async function logout(supabase){const session=read();try{if(session?.token&&supabase)await supabase.rpc('admin_logout_v147',{p_session_token:session.token})}finally{clear()}}
  global.KintoAdminSessionV147=Object.freeze({STORAGE_KEY,read,save,clear,login,identity,logout});
})(window);
