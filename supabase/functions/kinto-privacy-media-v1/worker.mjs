// Server-only. Never import into application/browser assets or log keys/tokens/object paths.
export async function processOne(client, token, requestId) {
 const rpc=async(name,extra={})=>{const {data,error}=await client.rpc(name,{p_session_token:token,p_request_id:requestId,...extra});if(error)throw Error('PRIVACY_MEDIA_RPC_FAILED');return data};
 await rpc('kinto_privacy_media_prepare_v1',{p_confirm_request_id:requestId});
 const job=await rpc('kinto_privacy_media_claim_v1');
 if(job?.idle||job?.held)return {state:job.held?'held':'idle',account_deleted:false};
 if(!job||!job.id||!job.lease||!['database','storage'].includes(job.kind)||job.bucket!=='product-review-images')throw Error('PRIVACY_MEDIA_JOB_INVALID');
 let removed=false;
 try {
  if(job.kind==='database')removed=true;
  else {
   // Exact source keys only, no URLs, glob/prefix deletion or empty-bucket operation.
   if(typeof job.path!=='string'||!/^reviews\/[0-9a-f-]{36}\/[a-zA-Z0-9_.-]+$/.test(job.path)||job.path.includes('..'))throw Error('PRIVACY_MEDIA_PATH_INVALID');
   const store=client.storage.from('product-review-images');
   const result=await store.remove([job.path]);if(result.error)throw Error('PRIVACY_MEDIA_REMOVE_FAILED');
   const slash=job.path.lastIndexOf('/'),folder=job.path.slice(0,slash),name=job.path.slice(slash+1);
   // Listing a directory through the authenticated API distinguishes absence from failed access.
   // A bare HTTP404 or failed listing is never treated as successful removal.
   for(let offset=0;offset<1000;offset+=100){const {data,error}=await store.list(folder,{limit:100,offset,search:name});if(error||!Array.isArray(data))throw Error('PRIVACY_MEDIA_VERIFY_FAILED');if(data.some(x=>x.name===name))throw Error('PRIVACY_MEDIA_STILL_PRESENT');if(data.length<100){removed=true;break}}
   if(!removed)throw Error('PRIVACY_MEDIA_VERIFY_LIMIT');
  }
 } catch {
  await rpc('kinto_privacy_media_finish_v1',{p_job_id:job.id,p_lease:job.lease,p_removed:false});
  return {state:'retry',account_deleted:false};
 }
 const result=await rpc('kinto_privacy_media_finish_v1',{p_job_id:job.id,p_lease:job.lease,p_removed:true});
 if(result?.removed!==true)throw Error('PRIVACY_MEDIA_FINISH_FAILED');
 return {state:'removed',account_deleted:false};
}
export async function processChatText(client,token,requestId,messageId){
 const {data,error}=await client.rpc('kinto_privacy_chat_erase_text_v1',{p_session_token:token,p_request_id:requestId,p_message_id:messageId,p_confirm_message_id:messageId});
 if(error||data?.erased!==true)throw Error('PRIVACY_CHAT_NOT_COMPLETED');
 return {state:'erased',account_deleted:false};
}
export async function processReviewRecord(client,token,requestId,reviewId){
 const {data,error}=await client.rpc('kinto_privacy_review_erase_v1',{p_session_token:token,p_request_id:requestId,p_review_id:reviewId,p_confirm_review_id:reviewId});
 if(error||data?.erased!==true)throw Error('PRIVACY_REVIEW_NOT_COMPLETED');
 return {state:'erased',account_deleted:false};
}
export async function handle(req,clientFactory,env) {
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Type':'application/json','Vary':'Origin'};
 const origin=req.headers.get('Origin');
 const allowedOrigin=!origin||['https://shopkinto.com','https://www.shopkinto.com'].includes(origin);
 if(origin&&allowedOrigin)headers['Access-Control-Allow-Origin']=origin;
 const reply=(body,status)=>new Response(JSON.stringify(body),{status,headers});
 if(!allowedOrigin)return reply({error:'ORIGIN_NOT_ALLOWED'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info'}});
 if(req.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
 // Both this switch and the reviewed database policy are absent/disabled by default.
 if(env('KINTO_PRIVACY_MEDIA_ENABLED')!=='true'&&env('KINTO_PRIVACY_CHAT_ENABLED')!=='true'&&env('KINTO_PRIVACY_REVIEW_ENABLED')!=='true')return reply({error:'PRIVACY_MEDIA_DISABLED'},503);
 const length=Number(req.headers.get('content-length')||0);if(length>8192)return reply({error:'INVALID_REQUEST'},400);
 let p;try{const raw=await req.text();if(raw.length>8192)return reply({error:'INVALID_REQUEST'},400);p=JSON.parse(raw)}catch{return reply({error:'INVALID_REQUEST'},400)}
 const chat=p?.operation==='erase_chat_text',review=p?.operation==='erase_review_record';
 if(p?.operation!=null&&!chat&&!review)return reply({error:'INVALID_REQUEST'},400);
 if(env(review?'KINTO_PRIVACY_REVIEW_ENABLED':chat?'KINTO_PRIVACY_CHAT_ENABLED':'KINTO_PRIVACY_MEDIA_ENABLED')!=='true')return reply({error:'PRIVACY_MEDIA_DISABLED'},503);
 if(!p||typeof p.session_token!=='string'||p.session_token.length<8||p.session_token.length>4096||typeof p.request_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.request_id)||p.confirm_request_id!==p.request_id||Object.keys(p).some(k=>!(review?['session_token','request_id','confirm_request_id','operation','review_id','confirm_review_id']:chat?['session_token','request_id','confirm_request_id','operation','message_id','confirm_message_id']:['session_token','request_id','confirm_request_id']).includes(k)))return reply({error:'INVALID_REQUEST'},400);
 if(chat&&(typeof p.message_id!=='string'||!/^(-?(0|[1-9][0-9]{0,18}))$/.test(p.message_id)||BigInt(p.message_id)>9223372036854775807n||BigInt(p.message_id)<-9223372036854775808n||p.confirm_message_id!==p.message_id))return reply({error:'INVALID_REQUEST'},400);
 if(review&&(typeof p.review_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.review_id)||p.review_id!==p.confirm_review_id))return reply({error:'INVALID_REQUEST'},400);
 const url=env('SUPABASE_URL'),key=env('SUPABASE_SERVICE_ROLE_KEY');if(!url||!key)return reply({error:'SERVICE_UNAVAILABLE'},503);
 try{const client=clientFactory(url,key,{auth:{persistSession:false,autoRefreshToken:false}});return reply(review?await processReviewRecord(client,p.session_token,p.request_id,p.review_id):chat?await processChatText(client,p.session_token,p.request_id,p.message_id):await processOne(client,p.session_token,p.request_id),200)}catch{return reply({error:'PRIVACY_MEDIA_NOT_COMPLETED'},409)}
}
