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
export async function handle(req,clientFactory,env) {
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Type':'application/json'};
 const reply=(body,status)=>new Response(JSON.stringify(body),{status,headers});
 if(req.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
 // Both this switch and the reviewed database policy are absent/disabled by default.
 if(env('KINTO_PRIVACY_MEDIA_ENABLED')!=='true')return reply({error:'PRIVACY_MEDIA_DISABLED'},503);
 const length=Number(req.headers.get('content-length')||0);if(length>8192)return reply({error:'INVALID_REQUEST'},400);
 let p;try{const raw=await req.text();if(raw.length>8192)return reply({error:'INVALID_REQUEST'},400);p=JSON.parse(raw)}catch{return reply({error:'INVALID_REQUEST'},400)}
 if(!p||typeof p.session_token!=='string'||p.session_token.length<8||p.session_token.length>4096||typeof p.request_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.request_id)||p.confirm_request_id!==p.request_id||Object.keys(p).some(k=>!['session_token','request_id','confirm_request_id'].includes(k)))return reply({error:'INVALID_REQUEST'},400);
 const url=env('SUPABASE_URL'),key=env('SUPABASE_SERVICE_ROLE_KEY');if(!url||!key)return reply({error:'SERVICE_UNAVAILABLE'},503);
 try{return reply(await processOne(clientFactory(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),p.session_token,p.request_id),200)}catch{return reply({error:'PRIVACY_MEDIA_NOT_COMPLETED'},409)}
}
