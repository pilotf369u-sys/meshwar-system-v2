// Independent endpoint: never calls the local account-management or payment endpoints.
const origins=(Deno.env.get('WORLD_SECURITY_ALLOWED_ORIGINS')||'https://shopkinto.com,https://pilotf369u-sys.github.io').split(',').map(x=>x.trim());
const digest=async(value:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'',headers={'Access-Control-Allow-Origin':origins.includes(origin)?origin:origins[0],'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin','Content-Type':'application/json'};
 const out=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});
 if(!origins.includes(origin))return out(403,{ok:false,error:'DENIED'});if(req.method==='OPTIONS')return new Response(null,{status:204,headers});if(req.method!=='POST')return out(405,{ok:false});
 const base=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),mailKey=Deno.env.get('RESEND_API_KEY'),email=Deno.env.get('KINTO_SECURITY_EMAIL');
 if(!base||!key||!mailKey||!email)return out(503,{ok:false,error:'UNCONFIGURED'});
 try{
  const body=await req.json(),session=String(body.session_token||'');if(session.length<20||session.length>512)return out(401,{ok:false,error:'ADMIN_DENIED'});
  const rpc=async(action:string,data:unknown)=>{const r=await fetch(base+'/rest/v1/rpc/kinto_world_staff_security_service_v1',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({p_admin_session_token:session,p_action:action,p_data:data})});if(!r.ok)throw Error('RPC_FAILED');return await r.json();};
  if(body.action==='request'){
   const a=new Uint32Array(1);crypto.getRandomValues(a);const otp=String(100000+a[0]%900000),result=await rpc('request',{payload:body.payload,code_hash:await digest(otp+key)});if(!result.ok)return out(400,result);
   let sent=false;try{const mail=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+mailKey,'Content-Type':'application/json'},body:JSON.stringify({from:'KINTO Security <onboarding@resend.dev>',to:[email],subject:'KINTO — تأكيد إدارة موظف المتاجر العالمية',html:'<div dir="rtl"><h2>KINTO</h2><p>رمز تأكيد إضافة أو تعطيل موظف المتاجر العالمية:</p><strong>'+otp+'</strong><p>صالح لعشر دقائق ولمرة واحدة.</p></div>'})});sent=mail.ok;}finally{if(!sent)await rpc('cancel',{challenge_id:result.challenge_id});}
   return sent?out(200,result):out(502,{ok:false,error:'EMAIL_SEND_FAILED'});
  }
  if(body.action==='verify'){
   const code=String(body.code||'');if(!/^\d{6}$/.test(code))return out(400,{ok:false,error:'INVALID_CODE'});
   const result=await rpc('verify',{challenge_id:body.challenge_id,code_hash:await digest(code+key),password:body.password});return out(result.ok?200:400,result);
  }
  if(body.action==='cancel')return out(200,await rpc('cancel',{challenge_id:body.challenge_id}));
  return out(400,{ok:false,error:'INVALID_ACTION'});
 }catch{return out(400,{ok:false,error:'WORLD_SECURITY_FAILED'});}
});
