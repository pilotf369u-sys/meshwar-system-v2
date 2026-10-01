import {createClient} from 'npm:@supabase/supabase-js@2';
const BUCKET='kinto-customer-notice-media',MAX=5*1024*1024;
const TYPES:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const origins=(Deno.env.get('NOTICE_ALLOWED_ORIGINS')||'https://pilotf369u-sys.github.io').split(',').map(s=>s.trim()).filter(Boolean);
function signature(type:string,b:Uint8Array){
 if(type==='image/jpeg')return b[0]===255&&b[1]===216&&b[2]===255;
 if(type==='image/png')return [137,80,78,71,13,10,26,10].every((x,i)=>b[i]===x);
 if(type==='image/gif')return ['GIF87a','GIF89a'].includes(String.fromCharCode(...b.slice(0,6)));
 if(type==='image/webp')return String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP';
 return false;
}
function dimensions(t:string,b:Uint8Array):[number,number]|null{
 const v=new DataView(b.buffer,b.byteOffset,b.byteLength);
 if(t==='image/png'&&b.length>=24)return [v.getUint32(16),v.getUint32(20)];
 if(t==='image/gif'&&b.length>=10)return [v.getUint16(6,true),v.getUint16(8,true)];
 if(t==='image/webp'&&b.length>=30){
  const kind=String.fromCharCode(...b.slice(12,16));
  if(kind==='VP8X')return [1+b[24]+(b[25]<<8)+(b[26]<<16),1+b[27]+(b[28]<<8)+(b[29]<<16)];
  if(kind==='VP8L'&&b[20]===47)return [1+(((b[22]&63)<<8)|b[21]),1+(((b[24]&15)<<10)|(b[23]<<2)|((b[22]&192)>>6))];
  if(kind==='VP8 '&&b[23]===157&&b[24]===1&&b[25]===42)return [v.getUint16(26,true)&16383,v.getUint16(28,true)&16383];
 }
 if(t==='image/jpeg'){
  let p=2;
  while(p+9<b.length){
   if(b[p]!==255){p++;continue}
   const marker=b[p+1];if(marker===216||marker===1){p+=2;continue}
   if(marker===217||marker===218)break;
   const len=(b[p+2]<<8)|b[p+3];if(len<2||p+2+len>b.length)break;
   if([192,193,194,195,198,199,201,202].includes(marker))return [(b[p+7]<<8)|b[p+8],(b[p+5]<<8)|b[p+6]];
   p+=2+len;
  }
 }
 return null;
}
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'';
 const hdr={'Access-Control-Allow-Origin':origins.includes(origin)?origin:origins[0],'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin','Content-Type':'application/json'};
 const out=(status:number,x:unknown)=>new Response(JSON.stringify(x),{status,headers:hdr});
 if(req.method==='OPTIONS')return new Response('',{status:204,headers:hdr});
 if(req.method!=='POST'||!origins.includes(origin))return out(403,{ok:false,error:'DENIED'});
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!key)return out(503,{ok:false,error:'UNCONFIGURED'});
 const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  if(Number(req.headers.get('content-length')||0)>MAX+16384)return out(413,{ok:false,error:'TOO_LARGE'});
  const form=await req.formData(),action=form.get('action'),session=form.get('session_token'),notice=form.get('notice_id');
  if(typeof session!=='string'||session.length<20||session.length>512||typeof notice!=='string'||!UUID.test(notice))return out(400,{ok:false,error:'INVALID_FIELDS'});
  if(action==='upload'){
   const file=form.get('file');
   if(!(file instanceof File)||!TYPES[file.type]||file.size<32||file.size>MAX)return out(415,{ok:false,error:'INVALID_FILE'});
   const {data:admin,error:adminError}=await sb.rpc('admin_session_identity_v147',{p_session_token:session});
   if(adminError||admin?.ok!==true)return out(401,{ok:false,error:'ADMIN_DENIED'});
   const {data:row,error:rowError}=await sb.from('kinto_customer_admin_notices').select('id,created_by,media_delete_pending_at').eq('id',notice).maybeSingle();
   if(rowError||!row||row.created_by!==String(admin.admin.id)||row.media_delete_pending_at)return out(403,{ok:false,error:'NOTICE_DENIED'});
   const {data:existing,error:existingError}=await sb.from('kinto_customer_notice_assets_v418').select('notice_id').eq('notice_id',notice).maybeSingle();
   if(existingError||existing)return out(409,{ok:false,error:'ALREADY_ATTACHED'});
   const b=new Uint8Array(await file.arrayBuffer()),dim=dimensions(file.type,b);
   if(!signature(file.type,b)||!dim||dim[0]<1||dim[1]<1||dim[0]>4096||dim[1]>4096||dim[0]*dim[1]>16000000)return out(415,{ok:false,error:'INVALID_IMAGE'});
   const path=notice+'/'+crypto.randomUUID()+'.'+TYPES[file.type];
   const {error:uploadError}=await sb.storage.from(BUCKET).upload(path,b,{contentType:file.type,upsert:false});
   if(uploadError)throw uploadError;
   const {data:attached,error:insertError}=await sb.rpc('attach_customer_notice_media_v428',{p_notice_id:notice,p_admin_id:String(admin.admin.id),p_object_path:path,p_mime_type:file.type,p_byte_size:file.size});
   if(insertError||attached!==true){
    const {error:cleanupError}=await sb.storage.from(BUCKET).remove([path]);
    if(cleanupError)console.error('notice-media-orphan-needs-reconciliation',path,cleanupError);
    throw insertError;
   }
   return out(201,{ok:true,attached:true});
  }
  if(action==='read'){
   const {data:identity,error:identityError}=await sb.rpc('customer_session_identity_v150',{p_session_token:session});
   if(identityError||identity?.ok!==true)return out(401,{ok:false,error:'CUSTOMER_DENIED'});
   const cid=String(identity.customer?.id||'');
   const {data:recipient,error:recipientError}=await sb.from('kinto_customer_admin_notice_recipients').select('notice_id').eq('notice_id',notice).eq('customer_id',cid).maybeSingle();
   if(recipientError||!recipient)return out(404,{ok:false,error:'NOT_FOUND'});
   const {data:n,error:nError}=await sb.from('kinto_customer_admin_notices').select('media_delete_pending_at').eq('id',notice).maybeSingle();
   if(nError||!n||n.media_delete_pending_at)return out(404,{ok:false,error:'NOT_FOUND'});
   const {data:asset,error:assetError}=await sb.from('kinto_customer_notice_assets_v418').select('object_path').eq('notice_id',notice).maybeSingle();
   if(assetError)throw assetError;
   if(!asset)return out(200,{ok:true,has_media:false});
   const {data:signed,error:signedError}=await sb.storage.from(BUCKET).createSignedUrl(asset.object_path,60);
   if(signedError)throw signedError;
   return out(200,{ok:true,has_media:true,url:signed.signedUrl});
  }
  return out(400,{ok:false,error:'INVALID_ACTION'});
 }catch(e){console.error('customer-notice-media-v427',e);return out(503,{ok:false,error:'MEDIA_FAILED'});}
});
