/* Session-bound operations; original pricing and management functions remain server-side delegates. */
(function(root){'use strict';
 const configuredRole=document.currentScript?.dataset.role||'vendor';
 const base='https://hsmmbloouskqdnptiiad.supabase.co/rest/v1/',key='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
 const admin=['admin_save_local_store','save_global_store','update_global_store','delete_global_store','save_site_content','admin_list_product_reviews_v138','admin_get_review_image_v139','admin_delete_product_review_image_v152','admin_moderate_product_review_v138'];
 const vendor=['vendor_get_profit_margin','vendor_set_profit_margin','vendor_set_exchange_rate','vendor_get_operating_expenses','vendor_add_operating_expense','vendor_get_financial_periods','vendor_submit_featured_request','vendor_list_featured_requests'];
 function session(win,role){let s;try{s=JSON.parse(win.sessionStorage.getItem(role==='admin'?'kinto_admin_session_v147':'meshwar_vendor_session_v95')||'null')}catch{}
  if(!s?.token||(s.expiresAt&&Date.parse(s.expiresAt)<=Date.now()))throw Error('STORE_SESSION_REQUIRED');return s.token;
 }
 async function rpc(sb,operation,args={},win=root){try{
  const role=admin.includes(operation)?'admin':vendor.includes(operation)?'vendor':null;if(!role)throw Error('STORE_OPERATION_DENIED');
  const parameters={p_role:role,p_session_token:session(win,role),p_operation:operation,p_args:args};
  if(sb)return await sb.rpc('kinto_store_operation_session_v1',parameters);
  const response=await win.fetch(base+'rpc/kinto_store_operation_session_v1',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify(parameters)});
  const data=await response.json();return response.ok?{data,error:null}:{data:null,error:data};
 }catch(error){return {data:null,error}}}
 function forWindow(win,nativeFetch){const native=nativeFetch||win.fetch.bind(win);return async(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url);
  if(url.origin!=='https://hsmmbloouskqdnptiiad.supabase.co')return native(input,init);
  if(url.pathname==='/rest/v1/local_stores'&&['GET','HEAD'].includes(request.method)){url.pathname='/rest/v1/kinto_local_stores_public_v1';return native(new Request(url.href,request));}
  const table=url.pathname.split('/').pop();
  if(['local_orders','local_returns','financial_settlements','local_store_financial_summary'].includes(table)){
   try{const headers=new Headers(request.headers);headers.set('x-kinto-role',configuredRole);headers.set('x-kinto-session',session(win,configuredRole));return native(new Request(request,{headers}));}catch(error){return new Response(JSON.stringify({message:error.message}),{status:401})}
  }
  if(['store_categories','currencies'].includes(table)&&!['GET','HEAD','OPTIONS'].includes(request.method)){
   try{const role=table==='currencies'?'admin':'vendor',token=session(win,role),action={POST:'insert',PATCH:'update',DELETE:'delete'}[request.method];if(!action)throw Error('CONTROL_METHOD_DENIED');
    const rawId=url.searchParams.get('id');if(rawId&&!rawId.startsWith('eq.'))throw Error('CONTROL_ID_INVALID');const id=rawId?.slice(3)||null;
    let patch=request.method==='DELETE'?{}:await request.clone().json();if(Array.isArray(patch)){if(patch.length!==1)throw Error('CONTROL_SINGLE_ROW_REQUIRED');patch=patch[0]}
    if(action!=='insert'&&!id)throw Error('CONTROL_ID_REQUIRED');url.pathname='/rest/v1/rpc/'+(table==='currencies'?'kinto_currency_write_session_v1':'kinto_category_write_session_v1');url.search='';
    return native(url.href,{method:'POST',headers:request.headers,signal:request.signal,body:JSON.stringify({p_session_token:token,p_action:action,p_id:id,p_patch:patch})});
   }catch(error){return new Response(JSON.stringify({message:error.message}),{status:401,headers:{'Content-Type':'application/json'}})}
  }
  const operation=url.pathname.startsWith('/rest/v1/rpc/')?url.pathname.split('/').pop():'';
  if(!admin.includes(operation)&&!vendor.includes(operation))return native(input,init);
  try{
   if(request.method!=='POST')throw Error('STORE_OPERATION_METHOD_DENIED');
   const role=admin.includes(operation)?'admin':'vendor',token=session(win,role),args=await request.clone().json();
   url.pathname='/rest/v1/rpc/kinto_store_operation_session_v1';
   return native(url.href,{method:'POST',headers:request.headers,signal:request.signal,body:JSON.stringify({p_role:role,p_session_token:token,p_operation:operation,p_args:args})});
  }catch(error){return new Response(JSON.stringify({message:error.message}),{status:401,headers:{'Content-Type':'application/json'}})}
 }}
 root.KintoStoreControlV1=Object.freeze({rpc,session,forWindow,fetch:forWindow(root)});
})(window);
