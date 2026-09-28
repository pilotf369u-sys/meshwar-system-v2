(function(global){
  'use strict';
  const STORAGE_KEY='kinto_customer_review_session_v132';
  const LOGGED_OUT_KEY='kinto_customer_logged_out_v150';
  const PERSIST_KEY='kinto_customer_session_v150';
  function read(){
    try{
      if(localStorage.getItem(LOGGED_OUT_KEY)==='1'){sessionStorage.removeItem(STORAGE_KEY);localStorage.removeItem(PERSIST_KEY);return null}
      const raw=sessionStorage.getItem(STORAGE_KEY)||localStorage.getItem(PERSIST_KEY)||'null';
      const value=JSON.parse(raw);
      if(value?.token&&!sessionStorage.getItem(STORAGE_KEY))sessionStorage.setItem(STORAGE_KEY,JSON.stringify(value));
      if(!value?.token)return null;
      if(value.expiresAt&&Date.parse(value.expiresAt)<=Date.now()){sessionStorage.removeItem(STORAGE_KEY);localStorage.removeItem(PERSIST_KEY);return null}
      return value;
    }catch{sessionStorage.removeItem(STORAGE_KEY);return null}
  }
  function save(token,expiresAt){localStorage.removeItem(LOGGED_OUT_KEY);const value={token:String(token),expiresAt:expiresAt||new Date(Date.now()+30*86400000).toISOString()};sessionStorage.setItem(STORAGE_KEY,JSON.stringify(value));localStorage.setItem(PERSIST_KEY,JSON.stringify(value))}
  async function identity(supabase){
    const session=read();
    if(!session)return null;
    let lastError=null;
    for(let attempt=0;attempt<2;attempt++){
      const {data,error}=await supabase.rpc('customer_session_identity_v150',{p_session_token:session.token});
      if(!error&&data?.ok&&data?.customer)return data.customer;
      lastError=error||new Error('CUSTOMER_SESSION_IDENTITY_EMPTY');
      if(attempt===0)await new Promise(resolve=>setTimeout(resolve,180));
    }
    const code=String(lastError?.code||''),message=String(lastError?.message||lastError||'');
    console.error('Customer session identity failed',{code,message});
    if(/REVIEW_SESSION_(INVALID|REQUIRED)|CUSTOMER_SESSION_INVALID/i.test(message)){sessionStorage.removeItem(STORAGE_KEY);localStorage.removeItem(PERSIST_KEY);}
    return null;
  }
  async function logout(supabase){
    const session=read();
    localStorage.setItem(LOGGED_OUT_KEY,'1');
    sessionStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PERSIST_KEY);
    if(!session)return;
    try{await supabase.rpc('customer_review_logout_v132',{p_session_token:session.token})}catch{}
  }
  global.KintoCustomerSessionV150=Object.freeze({read,save,identity,logout});
})(window);
