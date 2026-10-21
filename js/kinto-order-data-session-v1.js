/* Explicit per-client transport. Session headers are sent only to the KINTO orders endpoint. */
(function(root){'use strict';
 const configuredRole=document.currentScript?.dataset.role||'customer',origin='https://hsmmbloouskqdnptiiad.supabase.co';
 const versions={admin:147,employee:143,branch:148,courier:149};
 function read(win,key,local=false){try{return JSON.parse((local?win.localStorage:win.sessionStorage).getItem(key)||'null')}catch{return null}}
 function session(win){
  let role=configuredRole,value;
  if(role==='manifest'||role==='report'){const q=new URLSearchParams(win.location.search);role=q.has('adminId')?'admin':q.has('employeeId')?'employee':q.has('branchId')?'branch':''}
  if(role==='customer-view'&&win.KintoCustomerDirectoryV1)return win.KintoCustomerDirectoryV1.session();
  if(versions[role])value=read(win,`kinto_${role}_session_v${versions[role]}`);
  else if(role==='vendor')value=read(win,'meshwar_vendor_session_v95');
  else if(role==='customer'||role==='customer-view'){
   role='customer';if(win.localStorage.getItem('kinto_customer_logged_out_v150')==='1')throw Error('CUSTOMER_SESSION_REQUIRED');
   value=read(win,'kinto_customer_review_session_v132')||read(win,'kinto_customer_session_v150',true);
  }
  if(!value?.token||(value.expiresAt&&Date.parse(value.expiresAt)<=Date.now()))throw Error('ORDER_SESSION_REQUIRED');
  return {role,token:String(value.token)};
 }
 function forWindow(win,nativeFetch){const native=nativeFetch||win.fetch.bind(win);return async function(input,init){
  const request=new Request(input,init),url=new URL(request.url);
  if(url.origin!==origin||url.pathname!=='/rest/v1/orders')return native(input,init);
  try{
   const s=session(win),headers=new Headers(request.headers);headers.set('x-kinto-role',s.role);headers.set('x-kinto-session',s.token);
   if(s.role==='vendor'){
    if(!['GET','HEAD'].includes(request.method))throw Error('USE_VENDOR_ORDER_SESSION_RPC');
    url.pathname='/rest/v1/rpc/kinto_vendor_orders_read_session_v1';headers.set('Content-Type','application/json');
    const response=await native(url.href,{method:'POST',headers,body:JSON.stringify({p_session_token:s.token}),signal:request.signal});
    if(request.method==='HEAD')return new Response(null,{status:response.status,headers:response.headers});return response;
   }
   return native(new Request(request,{headers}));
  }catch(error){return new Response(JSON.stringify({message:error.message||'ORDER_SESSION_FAILED'}),{status:401,headers:{'Content-Type':'application/json'}})}
 }}
 function watch(win,onChange){
  if(win.__kintoOrderSessionWatchV1)return win.__kintoOrderSessionWatchV1;
  let signature=null,busy=false,stopped=false;const transport=forWindow(win);
  async function poll(){
   if(stopped||busy||win.document.hidden)return;
   // Never replace a row while its controls are being edited.
   if(win.document.activeElement?.matches?.('input,select,textarea,[contenteditable="true"]'))return;
   busy=true;try{
    session(win);const response=await transport(origin+'/rest/v1/orders?select=*&order=id.asc&limit=10000',{headers:{apikey:'sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH'},cache:'no-store'});
    if(!response.ok)return;const rows=await response.json();if(!Array.isArray(rows))return;const next=JSON.stringify(rows);
    if(signature!==null&&signature!==next)await onChange();signature=next;
   }catch(error){console.warn('Order session refresh unavailable',error)}finally{busy=false}
  }
  const timer=win.setInterval(poll,5000),visible=()=>{if(!win.document.hidden)poll()};
  win.document.addEventListener('visibilitychange',visible);win.addEventListener('focus',poll);
  function stop(){stopped=true;win.clearInterval(timer);win.document.removeEventListener('visibilitychange',visible);win.removeEventListener('focus',poll);delete win.__kintoOrderSessionWatchV1}
  win.addEventListener('pagehide',stop,{once:true});win.__kintoOrderSessionWatchV1=stop;poll();return stop;
 }
 root.KintoOrderDataSessionV1=Object.freeze({forWindow,session:()=>session(root),fetch:forWindow(root),watch});
})(window);
