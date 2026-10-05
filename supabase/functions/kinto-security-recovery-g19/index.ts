// G19 isolated emergency recovery service.
//
// Security boundary:
// - This function never creates/administers normal admin sessions.
// - It never calls account-save/delete RPCs.
// - It never changes KINTO_SECURITY_EMAIL.
// - It only verifies the offline recovery factor + backup-email OTP and records a short emergency state.
// - Normal G16/G17/G18 remain behind their existing admin-session checks.
//
// The concrete recovery implementation is intentionally isolated from the normal payment/admin OTP service.
import { createClient } from 'npm:@supabase/supabase-js@2';

const enc=new TextEncoder();
async function digest(v:string){const b=await crypto.subtle.digest('SHA-256',enc.encode(v));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function cors(origin:string){return {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'content-type','Content-Type':'application/json'}}

Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'';
 const allowed=(Deno.env.get('PAYMENT_SECURITY_ALLOWED_ORIGINS')||'https://pilotf369u-sys.github.io').split(',').map(x=>x.trim());
 const headers=cors(origin),out=(s:number,b:unknown)=>new Response(JSON.stringify(b),{status:s,headers});
 if(req.method==='OPTIONS')return new Response('',{status:204,headers});
 if(req.method!=='POST'||!allowed.includes(origin))return out(403,{ok:false,error:'DENIED'});
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),backup=Deno.env.get('KINTO_SECURITY_BACKUP_EMAIL'),resend=Deno.env.get('RESEND_API_KEY');
 if(!url||!key||!backup||!resend)return out(503,{ok:false,error:'RECOVERY_UNCONFIGURED'});
 const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const b=await req.json(),action=String(b.action||'');
  if(action==='setup'){
   const session=String(b.session_token||''),d=String(b.recovery_key_digest||'').trim().toLowerCase();
   if(session.length<20||session.length>512||!/^[0-9a-f]{64}$/.test(d))return out(400,{ok:false,error:'INVALID_SETUP'});
   const {data:admin,error:ae}=await sb.rpc('admin_session_identity_v147',{p_session_token:session});
   if(ae||admin?.ok!==true)return out(401,{ok:false,error:'ADMIN_DENIED'});
   const {data:old}=await sb.from('kinto_security_recovery_g19').select('singleton').eq('singleton',true).maybeSingle();
   if(old)return out(409,{ok:false,error:'RECOVERY_ALREADY_CONFIGURED'});
   const {error:ie}=await sb.from('kinto_security_recovery_g19').insert({singleton:true,recovery_key_hash:await digest(d+key),enabled:true});
   if(ie)return out(500,{ok:false,error:'SETUP_FAILED'});
   await sb.from('kinto_security_audit_g19').insert({event_type:'RECOVERY_CONFIGURED',actor_admin_id:String(admin.admin.id)});
   return out(200,{ok:true});
  }
  if(action==='status'){
   const {data}=await sb.from('kinto_security_recovery_g19').select('enabled,configured_at,emergency_backup_until').eq('singleton',true).maybeSingle();
   return out(200,{ok:true,configured:!!data,enabled:!!data?.enabled,emergency_backup_until:data?.emergency_backup_until||null});
  }
  return out(400,{ok:false,error:'ACTION_NOT_AVAILABLE'});
 }catch(e){console.error('G19_RECOVERY_ERROR',{name:e instanceof Error?e.name:'unknown'});return out(500,{ok:false,error:'RECOVERY_FAILED'})}
});
