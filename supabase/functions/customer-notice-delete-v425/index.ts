import { createClient } from 'npm:@supabase/supabase-js@2';
const BUCKET='kinto-customer-notice-media';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ORIGINS=(Deno.env.get('NOTICE_ALLOWED_ORIGINS')||'https://pilotf369u-sys.github.io').split(',').map(x=>x.trim()).filter(Boolean);
function headers(origin:string){return {'Content-Type':'application/json','Access-Control-Allow-Origin':ORIGINS.includes(origin)?origin:ORIGINS[0],'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'};}
Deno.serve(async request=>{
 const origin=request.headers.get('origin')||'';
 const reply=(status:number,value:unknown)=>new Response(JSON.stringify(value),{status,headers:headers(origin)});
 if(request.method==='OPTIONS')return new Response('',{status:204,headers:headers(origin)});
 if(request.method!=='POST')return reply(405,{ok:false,error:'METHOD_NOT_ALLOWED'});
 if(!ORIGINS.includes(origin))return reply(403,{ok:false,error:'ORIGIN_DENIED'});
 if(Number(request.headers.get('content-length')||0)>2048)return reply(413,{ok:false,error:'BODY_TOO_LARGE'});
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!key)return reply(503,{ok:false,error:'NOT_CONFIGURED'});
 let payload:Record<string,unknown>;
 try{payload=await request.json();}catch{return reply(400,{ok:false,error:'INVALID_JSON'});}
 const session=payload.session_token,notice=payload.notice_id;
 if(typeof session!=='string'||session.length<20||session.length>512||typeof notice!=='string'||!UUID.test(notice))return reply(400,{ok:false,error:'INVALID_FIELDS'});
 const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  // Revalidate the live admin account, including disabled/role changes.
  const {data:identity,error:identityError}=await sb.rpc('admin_session_identity_v147',{p_session_token:session});
  if(identityError||identity?.ok!==true)return reply(401,{ok:false,error:'ADMIN_SESSION_INVALID'});
  const {data:gate,error:gateError}=await sb.rpc('admin_prepare_customer_notice_delete_v425',{p_session_token:session,p_notice_id:notice});
  if(gateError)throw gateError;
  if(gate?.already_deleted)return reply(200,{ok:true,deleted:false,already_deleted:true});
  const {data:asset,error:assetError}=await sb.from('kinto_customer_notice_assets_v418').select('object_path,bucket_id').eq('notice_id',notice).maybeSingle();
  if(assetError)throw assetError;
  if(asset){
   if(asset.bucket_id!==BUCKET||!new RegExp('^'+notice+'/[0-9a-f-]{36}\\.(jpg|png|webp|gif)$','i').test(asset.object_path))
    return reply(409,{ok:false,error:'INVALID_STORED_ASSET_PATH'});
   const {error:removeError}=await sb.storage.from(BUCKET).remove([asset.object_path]);
   if(removeError)throw removeError;
   // Missing object is also safe: the Storage API treats removing absent objects as idempotent.
  }
  const {data:deleted,error:finalError}=await sb.rpc('finalize_customer_notice_delete_v425',{p_notice_id:notice});
  if(finalError)throw finalError;
  return reply(200,{ok:true,deleted:deleted===true});
 }catch(error){
  console.error('notice-delete-v425',error);
  return reply(503,{ok:false,error:'DELETE_PENDING_RETRY'});
 }
});
