(function employeeSessionV143Bootstrap(global){
  'use strict';
  const STORAGE_KEY='kinto_employee_session_v143';

  function normalizePayload(value){
    if(!value||typeof value!=='object')return null;
    const token=String(value.token||value.session_token||'').trim();
    const expiresAt=String(value.expiresAt||value.expires_at||'').trim();
    if(!token||!expiresAt||!Number.isFinite(Date.parse(expiresAt)))return null;
    return {token,expiresAt,employee:value.employee&&typeof value.employee==='object'?value.employee:null};
  }
  function read(){
    try{
      const session=normalizePayload(JSON.parse(sessionStorage.getItem(STORAGE_KEY)||'null'));
      if(!session||Date.parse(session.expiresAt)<=Date.now()){sessionStorage.removeItem(STORAGE_KEY);return null}
      return session;
    }catch{sessionStorage.removeItem(STORAGE_KEY);return null}
  }
  function save(payload){
    const session=normalizePayload(payload);
    if(!session)throw new Error('EMPLOYEE_SESSION_INVALID_PAYLOAD');
    sessionStorage.setItem(STORAGE_KEY,JSON.stringify(session));
    return session;
  }
  function clear(){sessionStorage.removeItem(STORAGE_KEY)}
  function rpcUnavailable(error){
    const code=String(error?.code||''),message=String(error?.message||error||'').toLowerCase();
    return code==='PGRST202'||code==='42883'||(message.includes('employee_login_v143')&&message.includes('not find'));
  }
  async function login(supabase,identity,password){
    const {data,error}=await supabase.rpc('employee_login_v143',{p_identity:String(identity||'').trim(),p_password:String(password||'')});
    if(error){if(rpcUnavailable(error))return {available:false,ok:false,error:'EMPLOYEE_SESSION_RPC_UNAVAILABLE'};throw error}
    if(!data?.ok||!data?.session_token)return {available:true,ok:false,error:String(data?.error||'EMPLOYEE_LOGIN_INVALID'),retryAfterSeconds:Number(data?.retry_after_seconds||0)};
    const session=save({token:data.session_token,expiresAt:data.expires_at,employee:data.employee});
    return {available:true,ok:true,session,employee:data.employee||null};
  }
  async function identity(supabase){
    const session=read();
    if(!session)throw new Error('EMPLOYEE_SESSION_REQUIRED');
    const {data,error}=await supabase.rpc('employee_session_identity_v143',{p_session_token:session.token});
    if(error||!data?.ok||!data?.employee){clear();throw error||new Error('EMPLOYEE_SESSION_INVALID')}
    save({...session,employee:data.employee});
    return data.employee;
  }
  async function logout(supabase){
    const session=read();
    try{if(session?.token&&supabase)await supabase.rpc('employee_logout_v143',{p_session_token:session.token})}finally{clear()}
  }
  global.KintoEmployeeSessionV143=Object.freeze({STORAGE_KEY,read,save,clear,login,identity,logout});
})(window);
