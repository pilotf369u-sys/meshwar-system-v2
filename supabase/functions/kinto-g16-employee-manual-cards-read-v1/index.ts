// KINTO G16: employee bank-method catalogue only (no image, no invoice).
// REVIEW ONLY — NOT DEPLOYED. Reads existing G16 rows, needs NO SQL migration.
// Completely separate from current production Edge functions/payment workflows.
import {createClient} from 'npm:@supabase/supabase-js@2';
const allowed=(Deno.env.get('KINTO_G16_CARDS_ALLOWED_ORIGINS')||'')
 .split(',').map(x=>x.trim()).filter(Boolean);
function response(status:number,body:unknown,origin:string){
 const headers:Record<string,string>={
  'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',
  'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
  'Access-Control-Allow-Methods':'POST,OPTIONS'
 };
 if(allowed.includes(origin))headers['Access-Control-Allow-Origin']=origin;
 return new Response(JSON.stringify(body),{status,headers});
}
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'';
 // Disabled by default. Never trust a browser flag to enable this feature.
 if(Deno.env.get('KINTO_G16_EMPLOYEE_CARDS_READ_APPROVED')!=='true')
  return response(503,{ok:false,error:'FEATURE_DISABLED'},origin);
 if(!allowed.length||!allowed.includes(origin))
  return response(403,{ok:false,error:'ORIGIN_DENIED'},origin);
 if(req.method==='OPTIONS')return response(204,{ok:true},origin);
 if(req.method!=='POST')return response(405,{ok:false,error:'METHOD_NOT_ALLOWED'},origin);
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!key)return response(503,{ok:false,error:'SERVER_UNCONFIGURED'},origin);
 const length=Number(req.headers.get('content-length')||0);
 if(!Number.isFinite(length)||length>2048)
  return response(413,{ok:false,error:'REQUEST_TOO_LARGE'},origin);
 let payload:Record<string,unknown>;
 try{payload=await req.json();}catch{return response(400,{ok:false,error:'INVALID_BODY'},origin)}
 if(payload?.action!=='list_verified_manual_cards')
  return response(400,{ok:false,error:'INVALID_ACTION'},origin);
 const token=payload.session_token;
 if(typeof token!=='string'||token.length<20||token.length>512)
  return response(401,{ok:false,error:'EMPLOYEE_SESSION_REQUIRED'},origin);
 const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  // Existing v143 checks expiration/revocation/disabled employee server-side.
  const {data:identity,error:sessionError}=await sb.rpc('employee_session_identity_v143',{
   p_session_token:token
  });
  const role=String(identity?.employee?.role||'').trim().toLowerCase();
  if(sessionError||identity?.ok!==true||!['employee','موظف'].includes(role))
   return response(403,{ok:false,error:'EMPLOYEE_DENIED'},origin);
  const {data:rows,error:dbError}=await sb.from('kinto_payment_methods_g16')
   .select('id,method_type,label,provider,recipient_name,account_reference,instructions,is_enabled,destination_verified_at,created_at')
   .eq('method_type','manual').eq('is_enabled',true)
   .not('destination_verified_at','is',null).order('created_at',{ascending:true}).limit(100);
  if(dbError||!rows)return response(503,{ok:false,error:'CATALOGUE_UNAVAILABLE'},origin);
  const cards=rows.filter(row=>
   typeof row.account_reference==='string'&&row.account_reference.trim()&&
   typeof row.recipient_name==='string'&&row.recipient_name.trim()&&
   row.destination_verified_at
  ).map(row=>({
   id:row.id,method_type:'manual',label:row.label,provider:row.provider,
   recipient_name:row.recipient_name,account_reference:row.account_reference,
   instructions:row.instructions,is_enabled:true,
   destination_verified_at:row.destination_verified_at,
   is_default:false,image_available:false
  }));
  // No image, sensitive OTP, payment status, order, customer, or invoice data.
  return response(200,{ok:true,cards},origin);
 }catch{
  return response(503,{ok:false,error:'READ_ONLY_BACKEND_UNAVAILABLE'},origin);
 }
});
