import {createClient} from 'npm:@supabase/supabase-js@2';
const origins=(Deno.env.get('PAYMENT_SECURITY_ALLOWED_ORIGINS')||'https://pilotf369u-sys.github.io').split(',').map(x=>x.trim()).filter(Boolean);
const enc=new TextEncoder();
async function digest(v:string){const b=await crypto.subtle.digest('SHA-256',enc.encode(v));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function code(){const a=new Uint32Array(1);crypto.getRandomValues(a);return String(100000+(a[0]%900000))}
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'',headers={'Access-Control-Allow-Origin':origins.includes(origin)?origin:origins[0],'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin','Content-Type':'application/json'};
 const out=(n:number,x:unknown)=>new Response(JSON.stringify(x),{status:n,headers});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST'||!origins.includes(origin))return out(403,{ok:false,error:'DENIED'});
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),resend=Deno.env.get('RESEND_API_KEY'),email=Deno.env.get('KINTO_SECURITY_EMAIL'),backupEmail=Deno.env.get('KINTO_SECURITY_BACKUP_EMAIL');
 if(!url||!key||!resend||!email)return out(503,{ok:false,error:'UNCONFIGURED'});
 const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const b=await req.json();const session=String(b.session_token||'');
  if(session.length<20||session.length>512)return out(401,{ok:false,error:'ADMIN_DENIED'});
  const {data:admin,error:ae}=await sb.rpc('admin_session_identity_v147',{p_session_token:session});
  if(ae||admin?.ok!==true)return out(401,{ok:false,error:'ADMIN_DENIED'});
  const adminId=String(admin.admin.id);
  if(b.action==='recovery_setup'){
   if(!backupEmail)return out(503,{ok:false,error:'BACKUP_EMAIL_UNCONFIGURED'});
   const d=String(b.recovery_key_digest||'').trim().toLowerCase();
   if(!/^[0-9a-f]{64}$/.test(d))return out(400,{ok:false,error:'RECOVERY_KEY_INVALID'});
   const {data:old}=await sb.from('kinto_security_recovery_g19').select('singleton').eq('singleton',true).maybeSingle();
   if(old)return out(409,{ok:false,error:'RECOVERY_ALREADY_CONFIGURED'});
   const {error:e}=await sb.from('kinto_security_recovery_g19').insert({singleton:true,recovery_key_hash:await digest(d+key),enabled:true});
   if(e)return out(500,{ok:false,error:'RECOVERY_SETUP_FAILED'});
   await sb.from('kinto_security_audit_g19').insert({event_type:'RECOVERY_CONFIGURED',actor_admin_id:adminId});
   return out(200,{ok:true});
  }
  if(b.action==='recovery_request'){
   if(!backupEmail)return out(503,{ok:false,error:'BACKUP_EMAIL_UNCONFIGURED'});
   const d=String(b.recovery_key_digest||'').trim().toLowerCase();
   if(!/^[0-9a-f]{64}$/.test(d))return out(400,{ok:false,error:'RECOVERY_KEY_INVALID'});
   const {data:cfg}=await sb.from('kinto_security_recovery_g19').select('recovery_key_hash,enabled').eq('singleton',true).maybeSingle();
   if(!cfg?.enabled||await digest(d+key)!==cfg.recovery_key_hash)return out(400,{ok:false,error:'RECOVERY_KEY_INVALID'});
   const since=new Date(Date.now()-30*60*1000).toISOString();
   const {count}=await sb.from('kinto_security_recovery_challenges_g19').select('id',{count:'exact',head:true}).gte('created_at',since);
   if((count||0)>=3)return out(429,{ok:false,error:'RECOVERY_RATE_LIMIT'});
   const otp=code(),hash=await digest(otp+key),expires=new Date(Date.now()+10*60*1000).toISOString();
   const {data:ch,error:ce}=await sb.from('kinto_security_recovery_challenges_g19').insert({requested_by_admin_id:adminId,code_hash:hash,expires_at:expires}).select('id').single();
   if(ce)return out(500,{ok:false,error:'CHALLENGE_CREATE_FAILED'});
   const mail=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+resend,'Content-Type':'application/json'},body:JSON.stringify({from:'KINTO Security <onboarding@resend.dev>',to:[backupEmail],subject:'KINTO — رمز استرداد أمني طارئ',html:`<div dir="rtl"><h2>KINTO Security Recovery</h2><p>رمز الاسترداد الأمني:</p><p style="font-size:30px;font-weight:700;letter-spacing:5px">${otp}</p><p>صالح 10 دقائق ولمرة واحدة.</p></div>`})});
   if(!mail.ok){await sb.from('kinto_security_recovery_challenges_g19').update({consumed_at:new Date().toISOString()}).eq('id',ch.id);console.error('G19_RECOVERY_EMAIL_FAILED',{status:mail.status});return out(502,{ok:false,error:'EMAIL_SEND_FAILED'});}
   await sb.from('kinto_security_audit_g19').insert({event_type:'RECOVERY_REQUESTED',actor_admin_id:adminId,recovery_challenge_id:ch.id});
   return out(200,{ok:true,challenge_id:ch.id,expires_in_seconds:600});
  }
  if(b.action==='recovery_verify'){
   const id=String(b.challenge_id||''),otp=String(b.code||'').trim();
   if(!/^[0-9]{6}$/.test(otp))return out(400,{ok:false,error:'INVALID_CODE'});
   const {data:ch}=await sb.from('kinto_security_recovery_challenges_g19').select('*').eq('id',id).maybeSingle();
   if(!ch||ch.requested_by_admin_id!==adminId||ch.consumed_at||new Date(ch.expires_at).getTime()<=Date.now())return out(400,{ok:false,error:'CHALLENGE_INVALID'});
   if(Number(ch.attempts)>=5)return out(429,{ok:false,error:'CHALLENGE_LOCKED'});
   if(await digest(otp+key)!==ch.code_hash){await sb.from('kinto_security_recovery_challenges_g19').update({attempts:Number(ch.attempts)+1}).eq('id',id);return out(400,{ok:false,error:'CODE_INVALID'});}
   await sb.from('kinto_security_recovery_challenges_g19').update({consumed_at:new Date().toISOString()}).eq('id',id);
   await sb.from('kinto_security_audit_g19').insert({event_type:'RECOVERY_VERIFIED',actor_admin_id:adminId,recovery_challenge_id:id});
   return out(200,{ok:true,recovery_verified:true});
  }
  if(b.action==='account_delete_request'){
   const accountId=String(b.account_id||'').trim(),accountType=String(b.account_type||'employee').trim();
   if(!accountId||!['employee','admin'].includes(accountType))return out(400,{ok:false,error:'INVALID_ACCOUNT'});
   if(accountId===adminId)return out(400,{ok:false,error:'SELF_DELETE_DENIED'});
   const since=new Date(Date.now()-15*60*1000).toISOString();
   const {count}=await sb.from('kinto_employee_email_challenges_g17').select('id',{count:'exact',head:true}).eq('admin_id',adminId).gte('created_at',since);
   if((count||0)>=3)return out(429,{ok:false,error:'RATE_LIMIT'});
   await sb.from('kinto_employee_email_challenges_g17').update({consumed_at:new Date().toISOString()}).eq('admin_id',adminId).is('consumed_at',null);
   const otp=code(),hash=await digest(otp+key),expires=new Date(Date.now()+10*60*1000).toISOString();
   const {data:c,error:ce}=await sb.from('kinto_employee_email_challenges_g17').insert({admin_id:adminId,payload:{security_action:'delete_account',account_id:accountId,account_type:accountType},code_hash:hash,expires_at:expires}).select('id').single();
   if(ce)return out(500,{ok:false,error:'CHALLENGE_CREATE_FAILED'});
   const mail=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+resend,'Content-Type':'application/json'},body:JSON.stringify({from:'KINTO Security <onboarding@resend.dev>',to:[email],subject:'KINTO — رمز تأكيد حذف حساب إداري',html:`<div dir="rtl" style="font-family:Arial,sans-serif"><h2>KINTO Security</h2><p>رمز تأكيد حذف حساب ${accountType==='admin'?'أدمن':'موظف'}:</p><p style="font-size:30px;font-weight:700;letter-spacing:5px">${otp}</p><p>صالح لمدة 10 دقائق ولمرة واحدة. إذا لم تطلب الحذف فلا تستخدم الرمز.</p></div>`})});
   if(!mail.ok){let reason='';try{const j=await mail.json();reason=String(j?.message||j?.name||'').slice(0,240)}catch{};console.error('G18_RESEND_SEND_FAILED',{status:mail.status,reason});await sb.from('kinto_employee_email_challenges_g17').update({consumed_at:new Date().toISOString()}).eq('id',c.id);return out(502,{ok:false,error:'EMAIL_SEND_FAILED',provider_status:mail.status});}
   return out(200,{ok:true,challenge_id:c.id,expires_in_seconds:600});
  }
  if(b.action==='account_delete_verify'){
   const id=String(b.challenge_id||''),otp=String(b.code||'').trim();
   if(!/^[0-9]{6}$/.test(otp))return out(400,{ok:false,error:'INVALID_CODE'});
   const {data:c}=await sb.from('kinto_employee_email_challenges_g17').select('*').eq('id',id).maybeSingle();
   if(!c||c.admin_id!==adminId||c.consumed_at||new Date(c.expires_at).getTime()<=Date.now())return out(400,{ok:false,error:'CHALLENGE_INVALID'});
   if(Number(c.attempts)>=5)return out(429,{ok:false,error:'CHALLENGE_LOCKED'});
   const p=c.payload||{};
   if(p.security_action!=='delete_account'||!p.account_id||!['employee','admin'].includes(String(p.account_type)))return out(400,{ok:false,error:'CHALLENGE_INVALID'});
   if(String(p.account_id)===adminId)return out(400,{ok:false,error:'SELF_DELETE_DENIED'});
   if(await digest(otp+key)!==c.code_hash){await sb.from('kinto_employee_email_challenges_g17').update({attempts:Number(c.attempts)+1}).eq('id',id);return out(400,{ok:false,error:'CODE_INVALID'});}
   const {data:deleted,error:de}=await sb.rpc('admin_delete_account_v307',{p_admin_session_token:session,p_account_type:String(p.account_type),p_account_id:String(p.account_id)});
   if(de||deleted?.ok!==true)return out(400,{ok:false,error:deleted?.error||'ACCOUNT_DELETE_FAILED'});
   await sb.from('kinto_employee_email_challenges_g17').update({consumed_at:new Date().toISOString()}).eq('id',id);
   return out(200,{ok:true});
  }
  if(b.action==='employee_request'){
   const p=b.payload||{},name=String(p.name||'').trim(),phone=String(p.phone||'').trim(),role=String(p.role||'').trim(),permissions=p.permissions||{};
   if(!name||name.length>120||phone.length<5||phone.length>40||!['employee','admin'].includes(role))return out(400,{ok:false,error:'INVALID_EMPLOYEE'});
   const since=new Date(Date.now()-15*60*1000).toISOString();
   const {count}=await sb.from('kinto_employee_email_challenges_g17').select('id',{count:'exact',head:true}).eq('admin_id',adminId).gte('created_at',since);
   if((count||0)>=3)return out(429,{ok:false,error:'RATE_LIMIT'});
   await sb.from('kinto_employee_email_challenges_g17').update({consumed_at:new Date().toISOString()}).eq('admin_id',adminId).is('consumed_at',null);
   const otp=code(),hash=await digest(otp+key),expires=new Date(Date.now()+10*60*1000).toISOString();
   const clean={name,phone,role,permissions};
   const {data:c,error:ce}=await sb.from('kinto_employee_email_challenges_g17').insert({admin_id:adminId,payload:clean,code_hash:hash,expires_at:expires}).select('id').single();
   if(ce)return out(500,{ok:false,error:'CHALLENGE_CREATE_FAILED'});
   const mail=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+resend,'Content-Type':'application/json'},body:JSON.stringify({from:'KINTO Security <onboarding@resend.dev>',to:[email],subject:'KINTO — رمز تأكيد إضافة مستخدم إداري',html:`<div dir="rtl" style="font-family:Arial,sans-serif"><h2>KINTO Security</h2><p>رمز تأكيد إضافة حساب ${role==='admin'?'أدمن':'موظف'} جديد:</p><p style="font-size:30px;font-weight:700;letter-spacing:5px">${otp}</p><p>صالح لمدة 10 دقائق ولمرة واحدة. إذا لم تطلب هذه العملية فلا تستخدم الرمز.</p></div>`})});
   if(!mail.ok){let reason='';try{const j=await mail.json();reason=String(j?.message||j?.name||'').slice(0,240)}catch{};console.error('G17_RESEND_SEND_FAILED',{status:mail.status,reason});await sb.from('kinto_employee_email_challenges_g17').update({consumed_at:new Date().toISOString()}).eq('id',c.id);return out(502,{ok:false,error:'EMAIL_SEND_FAILED',provider_status:mail.status});}
   return out(200,{ok:true,challenge_id:c.id,expires_in_seconds:600});
  }
  if(b.action==='employee_verify'){
   const id=String(b.challenge_id||''),otp=String(b.code||'').trim(),password=String(b.password||'');
   if(!/^[0-9]{6}$/.test(otp))return out(400,{ok:false,error:'INVALID_CODE'});
   if(password.length<8||password.length>200)return out(400,{ok:false,error:'INVALID_PASSWORD'});
   const {data:c}=await sb.from('kinto_employee_email_challenges_g17').select('*').eq('id',id).maybeSingle();
   if(!c||c.admin_id!==adminId||c.consumed_at||new Date(c.expires_at).getTime()<=Date.now())return out(400,{ok:false,error:'CHALLENGE_INVALID'});
   if(Number(c.attempts)>=5)return out(429,{ok:false,error:'CHALLENGE_LOCKED'});
   if(await digest(otp+key)!==c.code_hash){await sb.from('kinto_employee_email_challenges_g17').update({attempts:Number(c.attempts)+1}).eq('id',id);return out(400,{ok:false,error:'CODE_INVALID'});}
   const p=c.payload||{};
   const {data:saved,error:se}=await sb.rpc('admin_save_account_v300',{p_admin_session_token:session,p_account_type:p.role==='admin'?'admin':'employee',p_name:p.name,p_phone:p.phone,p_password:password,p_role:p.role,p_permissions:p.permissions||{}});
   if(se||saved?.ok!==true)return out(400,{ok:false,error:saved?.error||'ACCOUNT_CREATE_FAILED'});
   await sb.from('kinto_employee_email_challenges_g17').update({consumed_at:new Date().toISOString()}).eq('id',id);
   return out(200,{ok:true});
  }
  if(b.action==='request'){
   const methodId=b.method_id||null,payload=b.payload||{};
   const account=String(payload.account_reference||'').trim();
   if(account.length<2||account.length>150)return out(400,{ok:false,error:'INVALID_ACCOUNT'});
   if(methodId){
    const {data:m}=await sb.from('kinto_payment_methods_g16').select('id,method_type').eq('id',methodId).maybeSingle();
    if(!m||m.method_type!=='manual')return out(404,{ok:false,error:'METHOD_NOT_FOUND'});
   }
   const since=new Date(Date.now()-15*60*1000).toISOString();
   const {count}=await sb.from('kinto_payment_email_challenges_g16').select('id',{count:'exact',head:true}).eq('admin_id',adminId).gte('created_at',since);
   if((count||0)>=3)return out(429,{ok:false,error:'RATE_LIMIT'});
   await sb.from('kinto_payment_email_challenges_g16').update({consumed_at:new Date().toISOString()}).eq('admin_id',adminId).is('consumed_at',null);
   const otp=code(),hash=await digest(otp+key),expires=new Date(Date.now()+10*60*1000).toISOString();
   const clean={label:String(payload.label||'').trim(),provider:String(payload.provider||'').trim(),recipient_name:String(payload.recipient_name||'').trim(),account_reference:account,instructions:String(payload.instructions||'').trim()};
   const {data:c,error:ce}=await sb.from('kinto_payment_email_challenges_g16').insert({admin_id:adminId,method_id:methodId,payload:clean,code_hash:hash,expires_at:expires}).select('id').single();
   if(ce)return out(500,{ok:false,error:'CHALLENGE_CREATE_FAILED'});
   const mail=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+resend,'Content-Type':'application/json'},body:JSON.stringify({from:'KINTO Security <onboarding@resend.dev>',to:[email],subject:'KINTO — رمز تأكيد تغيير بيانات التحويل',html:`<div dir="rtl" style="font-family:Arial,sans-serif"><h2>KINTO Security</h2><p>رمز تأكيد تغيير بيانات التحويل المالي:</p><p style="font-size:30px;font-weight:700;letter-spacing:5px">${otp}</p><p>صالح لمدة 10 دقائق ولمرة واحدة. إذا لم تطلب هذا التغيير فلا تستخدم الرمز.</p></div>`})});
   if(!mail.ok){let reason='';try{const j=await mail.json();reason=String(j?.message||j?.name||'').slice(0,240)}catch{};console.error('G16_RESEND_SEND_FAILED',{status:mail.status,reason});await sb.from('kinto_payment_email_challenges_g16').update({consumed_at:new Date().toISOString()}).eq('id',c.id);return out(502,{ok:false,error:'EMAIL_SEND_FAILED',provider_status:mail.status});}
   return out(200,{ok:true,challenge_id:c.id,expires_in_seconds:600});
  }
  if(b.action==='verify'){
   const id=String(b.challenge_id||''),otp=String(b.code||'').trim();
   if(!/^[0-9]{6}$/.test(otp))return out(400,{ok:false,error:'INVALID_CODE'});
   const {data:c}=await sb.from('kinto_payment_email_challenges_g16').select('*').eq('id',id).maybeSingle();
   if(!c||c.admin_id!==adminId||c.consumed_at||new Date(c.expires_at).getTime()<=Date.now())return out(400,{ok:false,error:'CHALLENGE_INVALID'});
   if(Number(c.attempts)>=5)return out(429,{ok:false,error:'CHALLENGE_LOCKED'});
   if(await digest(otp+key)!==c.code_hash){await sb.from('kinto_payment_email_challenges_g16').update({attempts:Number(c.attempts)+1}).eq('id',id);return out(400,{ok:false,error:'CODE_INVALID'});}
   const p=c.payload;
   if(c.method_id){
    const {error:e}=await sb.from('kinto_payment_methods_g16').update({label:p.label,provider:p.provider,recipient_name:p.recipient_name||null,account_reference:p.account_reference,instructions:p.instructions||null,is_enabled:false,destination_verified_at:new Date().toISOString(),destination_verified_by:adminId,updated_at:new Date().toISOString()}).eq('id',c.method_id).eq('method_type','manual');if(e)return out(500,{ok:false,error:'APPLY_FAILED'});
   }else{
    const {error:e}=await sb.from('kinto_payment_methods_g16').insert({method_type:'manual',label:p.label,provider:p.provider,recipient_name:p.recipient_name||null,account_reference:p.account_reference,instructions:p.instructions||null,is_enabled:false,destination_verified_at:new Date().toISOString(),destination_verified_by:adminId});if(e)return out(500,{ok:false,error:'APPLY_FAILED'});
   }
   await sb.from('kinto_payment_email_challenges_g16').update({consumed_at:new Date().toISOString()}).eq('id',id);
   return out(200,{ok:true,method_enabled:false});
  }
  return out(400,{ok:false,error:'INVALID_ACTION'});
 }catch{return out(400,{ok:false,error:'BAD_REQUEST'})}
});