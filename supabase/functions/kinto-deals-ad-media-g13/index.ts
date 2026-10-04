import {createClient} from 'npm:@supabase/supabase-js@2';
const BUCKET='kinto-merchant-campaign-ads';
const MAX=204800;
const UUID=/^[0-9a-f-]{36}$/i;
const origins=['https://pilotf369u-sys.github.io'];
const reply=(origin:string,status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'}});
Deno.serve(async request=>{
 const origin=request.headers.get('origin')||'';
 if(!origins.includes(origin))return reply(origins[0],403,{ok:false,error:'ORIGIN_DENIED'});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'}});
 if(request.method!=='POST')return reply(origin,405,{ok:false,error:'METHOD_DENIED'});
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!key)return reply(origin,503,{ok:false,error:'UNCONFIGURED'});
 const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const form=await request.formData();
  const session=form.get('session_token'),campaign=form.get('campaign_id'),file=form.get('file');
  if(typeof session!=='string'||session.length<20||session.length>512||typeof campaign!=='string'||!UUID.test(campaign)||!(file instanceof File)||file.type!=='image/webp'||file.size<32||file.size>MAX)return reply(origin,400,{ok:false,error:'INVALID_INPUT'});
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(String.fromCharCode(...bytes.slice(0,4))!=='RIFF'||String.fromCharCode(...bytes.slice(8,12))!=='WEBP')return reply(origin,415,{ok:false,error:'INVALID_WEBP'});
  const path=campaign+'/'+crypto.randomUUID()+'.webp';
  const {error:uploadError}=await sb.storage.from(BUCKET).upload(path,bytes,{contentType:'image/webp',upsert:false});
  if(uploadError)throw uploadError;
  const {data,error}=await sb.rpc('kinto_deals_v1_attach_ad_g13',{p_session_token:session,p_campaign_id:campaign,p_object_path:path,p_byte_size:bytes.length});
  if(error||data?.ok!==true){await sb.storage.from(BUCKET).remove([path]);return reply(origin,403,{ok:false,error:'ATTACH_DENIED'})}
  return reply(origin,201,{ok:true,campaign_id:campaign});
 }catch(e){console.error('G13_UPLOAD',e);return reply(origin,500,{ok:false,error:'UPLOAD_FAILED'})}
});
