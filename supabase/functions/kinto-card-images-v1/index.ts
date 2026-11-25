// KINTO isolated G16 card image endpoint — REVIEW ONLY / NOT DEPLOYED.
// Read-only employee catalogue and private image URL; admin changes require a
// one-use OTP stored separately. No order, payment-status, stock or invoice writes.
import { createClient } from 'npm:@supabase/supabase-js@2';
const bucket = 'kinto-g16-card-images-v1';
const maxBytes = 204800;
const text = new TextEncoder();
const allowedOrigins = (Deno.env.get('PAYMENT_SECURITY_ALLOWED_ORIGINS') || 'https://pilotf369u-sys.github.io')
  .split(',').map(v => v.trim()).filter(Boolean);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function hex(b: Uint8Array){return [...b].map(v=>v.toString(16).padStart(2,'0')).join('')}
async function digest(v:string){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',text.encode(v))))}
function newCode(){const data=new Uint32Array(1);crypto.getRandomValues(data);return String(100000+data[0]%900000)}
function byteString(a:Uint8Array,start:number,length:number){
 return String.fromCharCode(...a.subarray(start,start+length));
}
function webpDimensions(data:Uint8Array){
 if(data.length<30||byteString(data,0,4)!=='RIFF'||byteString(data,8,4)!=='WEBP')throw Error('INVALID_WEBP');
 // The RIFF container size must equal its actual total length.
 const size=new DataView(data.buffer,data.byteOffset,data.byteLength).getUint32(4,true);
 if(size+8!==data.length)throw Error('INVALID_WEBP_LENGTH');
 const type=byteString(data,12,4);let width=0,height=0;
 if(type==='VP8X'&&data.length>=30){
  width=1+data[24]+(data[25]<<8)+(data[26]<<16);
  height=1+data[27]+(data[28]<<8)+(data[29]<<16);
 }else if(type==='VP8L'&&data.length>=25&&data[20]===0x2f){
  width=1+data[21]+((data[22]&0x3f)<<8);
  height=1+(data[22]>>6)+(data[23]<<2)+((data[24]&0x0f)<<10);
 }else if(type==='VP8 '&&data.length>=30&&data[23]===0x9d&&data[24]===0x01&&data[25]===0x2a){
  width=(data[26]+(data[27]<<8))&0x3fff;
  height=(data[28]+(data[29]<<8))&0x3fff;
 }else throw Error('UNSUPPORTED_WEBP_CONTAINER');
 if(width<1||height<1||width>1200||height>1200)throw Error('IMAGE_DIMENSIONS_INVALID');
 return {width,height};
}
function decodeBase64(value:unknown){
 if(typeof value!=='string'||value.length>275000||value.length<40
   ||value.length%4!==0||!/^[a-zA-Z0-9+/]+={0,2}$/.test(value))throw Error('INVALID_IMAGE_DATA');
 const decoded=atob(value);
 if(decoded.length>maxBytes||decoded.length<30)throw Error('IMAGE_SIZE_INVALID');
 const bytes=Uint8Array.from(decoded,c=>c.charCodeAt(0));
 webpDimensions(bytes);return bytes;
}
Deno.serve(async request=>{
 const origin=request.headers.get('origin')||'';
 const headers={
  'Access-Control-Allow-Origin': allowedOrigins.includes(origin)?origin:allowedOrigins[0],
  'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
  'Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin','Content-Type':'application/json',
  'Cache-Control':'no-store'
 };
 const reply=(status:number,payload:unknown)=>new Response(JSON.stringify(payload),{status,headers});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST'||!allowedOrigins.includes(origin))return reply(403,{ok:false,error:'DENIED'});
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!key)return reply(503,{ok:false,error:'UNCONFIGURED'});
 const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const body=await request.json();
  const action=String(body?.action||'');
  const session=String(body?.session_token||'');
  if(session.length<20||session.length>512)return reply(401,{ok:false,error:'SESSION_INVALID'});
  if(action==='employee_cards'||action==='employee_image'){
   const {data,error}=await sb.rpc('kinto_g16_employee_card_catalogue_v1',{p_employee_session_token:session});
   if(error||data?.ok!==true)return reply(403,{ok:false,error:'EMPLOYEE_DENIED'});
   const cards=Array.isArray(data.cards)?data.cards:[];
   if(action==='employee_cards'){
    return reply(200,{ok:true,cards:cards.map((c:Record<string,unknown>)=>({
     id:c.id,label:c.label,provider:c.provider,recipient_name:c.recipient_name,
     account_reference:c.account_reference,instructions:c.instructions,
     is_default:c.is_default,image_available:typeof c.image_object_key==='string'
    }))});
   }
   const methodId=String(body.method_id||'');
   const card=cards.find((c:Record<string,unknown>)=>c.id===methodId);
   if(!card||typeof card.image_object_key!=='string')return reply(404,{ok:false,error:'IMAGE_NOT_AVAILABLE'});
   const {data:signed,error:se}=await sb.storage.from(bucket).createSignedUrl(card.image_object_key,120);
   if(se||!signed?.signedUrl)return reply(500,{ok:false,error:'IMAGE_LINK_FAILED'});
   return reply(200,{ok:true,signed_url:signed.signedUrl,expires_in_seconds:120});
  }
  if(action!=='admin_request_image_otp'&&action!=='admin_commit_image')return reply(400,{ok:false,error:'INVALID_ACTION'});
  const {data:admin,error:ae}=await sb.rpc('admin_session_identity_v147',{p_session_token:session});
  if(ae||admin?.ok!==true)return reply(403,{ok:false,error:'ADMIN_DENIED'});
  const adminId=String(admin?.admin?.id||'');
  const methodId=String(body?.method_id||'');
  if(!uuid.test(methodId))return reply(400,{ok:false,error:'INVALID_METHOD'});
  const {data:method,error:me}=await sb.from('kinto_payment_methods_g16')
    .select('id,method_type,is_enabled,destination_verified_at').eq('id',methodId).maybeSingle();
  if(me||!method||method.method_type!=='manual'||method.is_enabled!==true||!method.destination_verified_at)
   return reply(403,{ok:false,error:'METHOD_NOT_APPROVED'});
  if(action==='admin_request_image_otp'){
   const resend=Deno.env.get('RESEND_API_KEY'),email=Deno.env.get('KINTO_SECURITY_EMAIL');
   if(!resend||!email)return reply(503,{ok:false,error:'SECURITY_MAIL_UNCONFIGURED'});
   const since=new Date(Date.now()-15*60*1000).toISOString();
   const {count,error:ce}=await sb.from('kinto_g16_card_image_challenges_v1')
     .select('id',{count:'exact',head:true}).eq('admin_id',adminId).gte('created_at',since);
   if(ce)return reply(503,{ok:false,error:'CHALLENGE_BACKEND_UNAVAILABLE'});
   if((count||0)>=3)return reply(429,{ok:false,error:'OTP_RATE_LIMIT'});
   const code=newCode(),codeHash=await digest(code+key);
   const {data:challenge,error:ie}=await sb.from('kinto_g16_card_image_challenges_v1')
     .insert({admin_id:adminId,method_id:methodId,make_default:body.make_default===true,
       code_hash:codeHash,expires_at:new Date(Date.now()+10*60*1000).toISOString()})
     .select('id').single();
   if(ie||!challenge)return reply(500,{ok:false,error:'CHALLENGE_CREATE_FAILED'});
   const mail=await fetch('https://api.resend.com/emails',{method:'POST',
    headers:{Authorization:'Bearer '+resend,'Content-Type':'application/json'},
    body:JSON.stringify({from:'KINTO Security <onboarding@resend.dev>',to:[email],
      subject:'KINTO — رمز تأكيد صورة بطاقة التحويل',
      html:'<div dir="rtl" style="font-family:Arial"><h2>KINTO</h2><p>رمز تغيير صورة بطاقة التحويل/اختيار البطاقة الافتراضية:</p><h1>'+code+'</h1><p>صالح لمدة 10 دقائق ولمرة واحدة.</p></div>'})});
   if(!mail.ok){
    await sb.from('kinto_g16_card_image_challenges_v1')
     .update({consumed_at:new Date().toISOString()}).eq('id',challenge.id);
    return reply(502,{ok:false,error:'SECURITY_EMAIL_FAILED'});
   }
   return reply(200,{ok:true,challenge_id:challenge.id,expires_in_seconds:600});
  }
  const challengeId=String(body.challenge_id||''),otp=String(body.code||'');
  if(!uuid.test(challengeId)||!/^[0-9]{6}$/.test(otp))return reply(400,{ok:false,error:'INVALID_CHALLENGE_INPUT'});
  const bytes=decodeBase64(body.webp_base64);
  const objectName=hex(crypto.getRandomValues(new Uint8Array(16)))+'.webp';
  const objectPath='g16-cards/'+methodId+'/'+objectName;
  const {error:ue}=await sb.storage.from(bucket).upload(objectPath,bytes,{
   contentType:'image/webp',cacheControl:'3600',upsert:false});
  if(ue)return reply(500,{ok:false,error:'PRIVATE_IMAGE_UPLOAD_FAILED'});
  const {data:committed,error:de}=await sb.rpc('kinto_g16_card_asset_commit_v1',{
   p_admin_session_token:session,p_challenge_id:challengeId,
   p_otp_hash:await digest(otp+key),p_method_id:methodId,p_image_object_key:objectPath});
  if(de||committed?.ok!==true){
   await sb.storage.from(bucket).remove([objectPath]);
   return reply(400,{ok:false,error:committed?.error||'CARD_IMAGE_COMMIT_DENIED'});
  }
  return reply(200,{ok:true,method_id:methodId});
 }catch(e){
  const message=String(e instanceof Error?e.message:'REQUEST_INVALID');
  const safe=new Set(['INVALID_IMAGE_DATA','IMAGE_SIZE_INVALID','INVALID_WEBP',
   'INVALID_WEBP_LENGTH','UNSUPPORTED_WEBP_CONTAINER','IMAGE_DIMENSIONS_INVALID']);
  return reply(400,{ok:false,error:safe.has(message)?message:'INVALID_REQUEST'});
 }
});
