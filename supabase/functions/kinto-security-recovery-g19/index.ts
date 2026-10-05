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
function cors(origin:string){return {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Max-Age':'86400','Vary':'Origin','Content-Type':'application/json'}}

Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'';
 const allowed=(Deno.env.get('PAYMENT_SECURITY_ALLOWED_ORIGINS')||'https://pilotf369u-sys.github.io').split(',').map(x=>x.trim());
 const originAllowed=allowed.includes(origin);
 const headers=cors(originAllowed?origin:allowed[0]),out=(s:number,b:unknown)=>new Response(JSON.stringify(b),{status:s,headers});
 if(req.method==='OPTIONS')return originAllowed?new Response(null,{status:204,headers}):out(403,{ok:false,error:'DENIED'});
 if(req.method!=='POST'||!originAllowed)return out(403,{ok:false,error:'DENIED'});
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),backup=Deno.env.get('KINTO_SECURITY_BACKUP_EMAIL'),resend=Deno.env.get('RESEND_API_KEY');
 if(!url||!key||!backup||!resend)return out(503,{ok:false,error:'RECOVERY_UNCONFIGURED'});
 const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const b=await req.json(),action=String(b.action||'');
  if(action==='setup_request'){
   const session=String(b.session_token||''),d=String(b.recovery_key_digest||'').trim().toLowerCase();
   if(session.length<20||session.length>512||!/^[0-9a-f]{64}$/.test(d))return out(400,{ok:false,error:'INVALID_SETUP'});
   const {data:admin,error:ae}=await sb.rpc('admin_session_identity_v147',{p_session_token:session});
   if(ae||admin?.ok!==true)return out(401,{ok:false,error:'ADMIN_DENIED'});
   const {data:old}=await sb.from('kinto_security_recovery_g19').select('singleton').eq('singleton',true).maybeSingle();
   if(old)return out(409,{ok:false,error:'RECOVERY_ALREADY_CONFIGURED'});
   const expires=new Date(Date.now()+10*60*1000).toISOString();
   const a=new Uint32Array(1);crypto.getRandomValues(a);const otp=String(100000+(a[0]%900000));
   const {data:ch,error:ce}=await sb.from('kinto_security_recovery_challenges_g19').insert({requested_by_admin_id:String(admin.admin.id),code_hash:await digest(d+key),email_code_hash:await digest(otp+key),email_sent_at:new Date().toISOString(),expires_at:expires}).select('id').single();
   if(ce)return out(500,{ok:false,error:'SETUP_CHALLENGE_FAILED'});
   const mail=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+resend,'Content-Type':'application/json'},body:JSON.stringify({from:'KINTO Security <onboarding@resend.dev>',to:[backup],subject:'KINTO — تأكيد بريد الاسترداد الاحتياطي',html:`<div dir="rtl"><h2>KINTO Security</h2><p>رمز تأكيد إعداد بريد الاسترداد الاحتياطي:</p><p style="font-size:30px;font-weight:700;letter-spacing:5px">${otp}</p><p>صالح لمدة 10 دقائق ولمرة واحدة.</p></div>`})});
   if(!mail.ok){await sb.from('kinto_security_recovery_challenges_g19').update({consumed_at:new Date().toISOString()}).eq('id',ch.id);return out(502,{ok:false,error:'EMAIL_FAILED'})}
   return out(200,{ok:true,challenge_id:ch.id,expires_in_seconds:600});
  }
  if(action==='setup_verify'){
   const session=String(b.session_token||''),id=String(b.challenge_id||''),d=String(b.recovery_key_digest||'').trim().toLowerCase(),otp=String(b.code||'').trim();
   if(session.length<20||!/^[0-9a-f]{64}$/.test(d)||!/^[0-9]{6}$/.test(otp))return out(400,{ok:false,error:'INVALID_SETUP'});
   const {data:admin,error:ae}=await sb.rpc('admin_session_identity_v147',{p_session_token:session});
   if(ae||admin?.ok!==true)return out(401,{ok:false,error:'ADMIN_DENIED'});
   const {data:ch}=await sb.from('kinto_security_recovery_challenges_g19').select('*').eq('id',id).maybeSingle();
   if(!ch||ch.requested_by_admin_id!==String(admin.admin.id)||ch.consumed_at||new Date(ch.expires_at).getTime()<=Date.now()||Number(ch.attempts)>=5)return out(400,{ok:false,error:'SETUP_CHALLENGE_INVALID'});
   if(await digest(d+key)!==ch.code_hash||await digest(otp+key)!==ch.email_code_hash){await sb.from('kinto_security_recovery_challenges_g19').update({attempts:Number(ch.attempts)+1}).eq('id',id);return out(400,{ok:false,error:'SETUP_PROOF_INVALID'})}
   const {data:old}=await sb.from('kinto_security_recovery_g19').select('singleton').eq('singleton',true).maybeSingle();
   if(old)return out(409,{ok:false,error:'RECOVERY_ALREADY_CONFIGURED'});
   const {error:ie}=await sb.from('kinto_security_recovery_g19').insert({singleton:true,recovery_key_hash:await digest(d+key),enabled:true});
   if(ie)return out(500,{ok:false,error:'SETUP_FAILED'});
   await sb.from('kinto_security_recovery_challenges_g19').update({consumed_at:new Date().toISOString()}).eq('id',id);
   await sb.from('kinto_security_audit_g19').insert({event_type:'RECOVERY_CONFIGURED',actor_admin_id:String(admin.admin.id),recovery_challenge_id:id});
   return out(200,{ok:true});
  }
  if(action==='begin'){
   const d=String(b.recovery_key_digest||'').trim().toLowerCase(),target=String(b.target_admin_id||'').trim();
   if(!/^[0-9a-f]{64}$/.test(d)||!target)return out(400,{ok:false,error:'RECOVERY_DENIED'});
   const {data:cfg}=await sb.from('kinto_security_recovery_g19').select('recovery_key_hash,enabled').eq('singleton',true).maybeSingle();
   if(!cfg?.enabled||await digest(d+key)!==cfg.recovery_key_hash)return out(400,{ok:false,error:'RECOVERY_DENIED'});
   const {data:actor}=await sb.from('employees').select('id,role').eq('id',target).maybeSingle();
   if(!actor||!['admin','أدمن','ادمن'].includes(String(actor.role||'').toLowerCase().trim()))return out(400,{ok:false,error:'RECOVERY_DENIED'});
   const since=new Date(Date.now()-15*60*1000).toISOString();
   const {count}=await sb.from('kinto_security_recovery_challenges_g19').select('id',{count:'exact',head:true}).gte('created_at',since);
   if((count||0)>=3)return out(429,{ok:false,error:'RECOVERY_RATE_LIMITED'});
   await sb.from('kinto_security_recovery_challenges_g19').update({consumed_at:new Date().toISOString()}).is('consumed_at',null).lt('expires_at',new Date().toISOString());
   const expires=new Date(Date.now()+10*60*1000).toISOString();
   const nonce=crypto.randomUUID(),codeHash=await digest(nonce+key);
   const {data:ch,error:ce}=await sb.from('kinto_security_recovery_challenges_g19').insert({requested_by_admin_id:target,code_hash:codeHash,expires_at:expires}).select('id').single();
   if(ce)return out(500,{ok:false,error:'CHALLENGE_FAILED'});
   await sb.from('kinto_security_audit_g19').insert({event_type:'RECOVERY_CHALLENGE_OPENED',target_admin_id:target,recovery_challenge_id:ch.id});
   return out(200,{ok:true,challenge_id:ch.id,expires_in_seconds:600});
  }
  if(action==='send_backup_code'){
   const id=String(b.challenge_id||'').trim();
   const {data:ch}=await sb.from('kinto_security_recovery_challenges_g19').select('id,expires_at,consumed_at,email_sent_at').eq('id',id).maybeSingle();
   if(!ch||ch.consumed_at||new Date(ch.expires_at).getTime()<=Date.now())return out(400,{ok:false,error:'CHALLENGE_INVALID'});
   if(ch.email_sent_at)return out(409,{ok:false,error:'CODE_ALREADY_SENT'});
   const a=new Uint32Array(1);crypto.getRandomValues(a);const otp=String(a[0]%1000000).padStart(6,'0');
   const {error:ue}=await sb.from('kinto_security_recovery_challenges_g19').update({email_code_hash:await digest(otp+key),email_sent_at:new Date().toISOString()}).eq('id',id).is('email_sent_at',null);
   if(ue)return out(500,{ok:false,error:'CHALLENGE_UPDATE_FAILED'});
   const mail=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+resend,'Content-Type':'application/json'},body:JSON.stringify({from:'KINTO Security <onboarding@resend.dev>',to:[backup],subject:'KINTO — Emergency Recovery',html:`<div dir="rtl"><h2>KINTO Security</h2><p>رمز تأكيد الاسترداد الطارئ:</p><p style="font-size:30px;font-weight:700;letter-spacing:5px">${otp}</p><p>صالح لمدة 10 دقائق. لا تشاركه مع أي شخص.</p></div>`})});
   if(!mail.ok){
    console.error('G19_BACKUP_MAIL_FAILED',{status:mail.status});
    await sb.from('kinto_security_recovery_challenges_g19').update({email_code_hash:null,email_sent_at:null}).eq('id',id);
    return out(502,{ok:false,error:'EMAIL_FAILED'});
   }
   await sb.from('kinto_security_audit_g19').insert({event_type:'BACKUP_OTP_SENT',recovery_challenge_id:id});
   return out(200,{ok:true});
  }
  if(action==='confirm_backup_code'){
   const session=String(b.session_token||''),id=String(b.challenge_id||'').trim(),otp=String(b.code||'').trim();
   if(session.length<20||session.length>512||!/^[0-9]{6}$/.test(otp))return out(400,{ok:false,error:'INVALID_CONFIRMATION'});
   const {data:admin,error:ae}=await sb.rpc('admin_session_identity_v147',{p_session_token:session});
   if(ae||admin?.ok!==true)return out(401,{ok:false,error:'ADMIN_DENIED'});
   const adminId=String(admin.admin.id);
   const {data:ch}=await sb.from('kinto_security_recovery_challenges_g19').select('id,requested_by_admin_id,email_code_hash,expires_at,attempts,consumed_at').eq('id',id).maybeSingle();
   if(!ch||ch.requested_by_admin_id!==adminId||ch.consumed_at||!ch.email_code_hash||new Date(ch.expires_at).getTime()<=Date.now())return out(400,{ok:false,error:'CHALLENGE_INVALID'});
   if(Number(ch.attempts)>=5)return out(429,{ok:false,error:'CHALLENGE_LOCKED'});
   if(await digest(otp+key)!==ch.email_code_hash){
    await sb.from('kinto_security_recovery_challenges_g19').update({attempts:Number(ch.attempts)+1}).eq('id',id).eq('attempts',Number(ch.attempts));
    return out(400,{ok:false,error:'CODE_INVALID'});
   }
   const now=new Date().toISOString(),until=new Date(Date.now()+24*60*60*1000).toISOString();
   const {error:stateError}=await sb.from('kinto_security_recovery_g19').update({emergency_backup_until:until,emergency_target_admin_id:adminId,emergency_activated_at:now,last_recovered_at:now,last_recovered_by:adminId}).eq('singleton',true).eq('enabled',true);
   if(stateError)return out(500,{ok:false,error:'RECOVERY_STATE_FAILED'});
   await sb.from('kinto_security_recovery_challenges_g19').update({consumed_at:now}).eq('id',id).is('consumed_at',null);
   await sb.from('kinto_security_audit_g19').insert({event_type:'BACKUP_CHANNEL_CONFIRMED',actor_admin_id:adminId,target_admin_id:adminId,recovery_challenge_id:id});
   return out(200,{ok:true,emergency_until:until});
  }
  if(action==='status'){
   const session=String(b.session_token||'');
   if(session.length<20||session.length>512)return out(401,{ok:false,error:'ADMIN_DENIED'});
   const {data:admin,error:ae}=await sb.rpc('admin_session_identity_v147',{p_session_token:session});
   if(ae||admin?.ok!==true)return out(401,{ok:false,error:'ADMIN_DENIED'});
   const {data}=await sb.from('kinto_security_recovery_g19').select('enabled,configured_at,emergency_backup_until').eq('singleton',true).maybeSingle();
   return out(200,{ok:true,configured:!!data,enabled:!!data?.enabled,emergency_backup_until:data?.emergency_backup_until||null});
  }
  return out(400,{ok:false,error:'ACTION_NOT_AVAILABLE'});
 }catch(e){console.error('G19_RECOVERY_ERROR',{name:e instanceof Error?e.name:'unknown'});return out(500,{ok:false,error:'RECOVERY_FAILED'})}
});
