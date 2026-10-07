(function branchSessionV148Bootstrap(global){
  'use strict';
  const STORAGE_KEY='kinto_branch_session_v148';
  function normalize(value){
    if(!value||typeof value!=='object')return null;
    const token=String(value.token||value.session_token||'').trim();
    const expiresAt=String(value.expiresAt||value.expires_at||'').trim();
    if(!token||!expiresAt||!Number.isFinite(Date.parse(expiresAt)))return null;
    return {token,expiresAt,branch:value.branch&&typeof value.branch==='object'?value.branch:null};
  }
  function read(){
    try{const value=normalize(JSON.parse(sessionStorage.getItem(STORAGE_KEY)||'null'));if(!value||Date.parse(value.expiresAt)<=Date.now()){sessionStorage.removeItem(STORAGE_KEY);return null}return value}
    catch{sessionStorage.removeItem(STORAGE_KEY);return null}
  }
  function save(payload){const value=normalize(payload);if(!value)throw new Error('BRANCH_SESSION_INVALID_PAYLOAD');sessionStorage.setItem(STORAGE_KEY,JSON.stringify(value));return value}
  function clear(){sessionStorage.removeItem(STORAGE_KEY)}
  async function login(supabase,identity,password){
    const {data,error}=await supabase.rpc('branch_login_v148',{p_identity:String(identity||'').trim(),p_password:String(password||'')});
    if(error)throw error;
    if(!data?.ok||!data?.session_token)return {ok:false,error:String(data?.error||'BRANCH_LOGIN_INVALID'),retryAfterSeconds:Number(data?.retry_after_seconds||0)};
    const session=save({token:data.session_token,expiresAt:data.expires_at,branch:data.branch});
    return {ok:true,session,branch:data.branch||null};
  }
  async function identity(supabase){
    const session=read();if(!session)throw new Error('BRANCH_SESSION_REQUIRED');
    const {data,error}=await supabase.rpc('branch_session_identity_v148',{p_session_token:session.token});
    if(error||!data?.ok||!data?.branch){clear();throw error||new Error('BRANCH_SESSION_INVALID')}
    save({...session,branch:data.branch});
    global.document?.documentElement?.classList.remove('branch-auth-pending');
    return data.branch;
  }
  async function logout(supabase){const session=read();try{if(session?.token&&supabase)await supabase.rpc('branch_logout_v148',{p_session_token:session.token})}finally{clear()}}
  global.KintoBranchSessionV148=Object.freeze({STORAGE_KEY,read,save,clear,login,identity,logout});
})(window);
