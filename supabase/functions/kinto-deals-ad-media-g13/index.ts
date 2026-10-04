import {createClient} from 'npm:@supabase/supabase-js@2';
const BUCKET='kinto-merchant-campaign-ads';
const MAX=204800;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
  const {data:drafts,error:authError}=await sb.rpc('kinto_deals_v1_vendor_drafts_g4',{p_session_token:session,p_campaign_id:campaign,p_limit:1});
  if(authError||!drafts?.items||drafts.items.length!==1||drafts.items[0].id!==campaign)return reply(origin,403,{ok:false,error:'CAMPAIGN_NOT_OWNED'});
  const {data:row,error:rowError}=await sb.from('kinto_deals_v1_campaigns').select('status').eq('id',campaign).maybeSingle();
  if(rowError||row?.status!=='draft')return reply(origin,409,{ok:false,error:'DRAFT_REQUIRED'});
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(String.fromCharCode(...bytes.slice(0,4))!=='RIFF'||String.fromCharCode(...bytes.slice(8,12))!=='WEBP')return reply(origin,415,{ok:false,error:'INVALID_WEBP'});
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const kind=String.fromCharCode(...bytes.slice(12,16));
  let width=0,height=0;
  if(kind==='VP8X'&&bytes.length>=30){width=1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16);height=1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16)}
  else if(kind==='VP8L'&&bytes.length>=25&&bytes[20]===47){width=1+(((bytes[22]&63)<<8)|bytes[21]);height=1+(((bytes[24]&15)<<10)|(bytes[23]<<2)|((bytes[22]&192)>>6))}
  else if(kind==='VP8 '&&bytes.length>=30&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42){width=view.getUint16(26,true)&16383;height=view.getUint16(28,true)&16383}
  if(width<1||height<1||width>1200||height>1200)return reply(origin,415,{ok:false,error:'INVALID_DIMENSIONS'});
  const path=campaign+'/'+crypto.randomUUID()+'.webp';
  const {error:uploadError}=await sb.storage.from(BUCKET).upload(path,bytes,{contentType:'image/webp',upsert:false});
  if(uploadError)throw uploadError;
  const {data,error}=await sb.rpc('kinto_deals_v1_attach_ad_g13',{p_session_token:session,p_campaign_id:campaign,p_object_path:path,p_byte_size:bytes.length,p_width:width,p_height:height});
  if(error||data?.ok!==true){await sb.storage.from(BUCKET).remove([path]);return reply(origin,403,{ok:false,error:'ATTACH_DENIED'})}
  return reply(origin,201,{ok:true,campaign_id:campaign});
 }catch(e){console.error('G13_UPLOAD',e);return reply(origin,500,{ok:false,error:'UPLOAD_FAILED'})}
});
