import {createClient} from 'npm:@supabase/supabase-js@2';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return new Response(null,{status:405,headers});
 let payload:Record<string,unknown>;
 try{payload=await req.json();}catch{return new Response(null,{status:400,headers});}
 const submission=payload.submission_id,token=payload.session_token;
 if(typeof submission!=='string'||!UUID.test(submission)||typeof token!=='string'||token.length<8||token.length>4096)
  return new Response(null,{status:400,headers});
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!key)return new Response(null,{status:503,headers});
 const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 // Existing verified admin RPC authorizes access to this exact submission; do not use public publication gate.
 const {data:detail,error:authError}=await sb.rpc('kinto_deals_v1_admin_detail_g3',{p_session_token:token,p_submission_id:submission});
 if(authError||!detail?.campaign_id)return new Response(null,{status:403,headers});
 const {data:asset,error:assetError}=await sb.from('kinto_deals_v1_ad_assets_g13').select('object_path').eq('campaign_id',detail.campaign_id).maybeSingle();
 if(assetError||!asset?.object_path)return new Response(null,{status:404,headers});
 const {data:file,error:downloadError}=await sb.storage.from('kinto-merchant-campaign-ads').download(asset.object_path);
 if(downloadError||!file)return new Response(null,{status:404,headers});
 return new Response(file.stream(),{status:200,headers:{...headers,'Content-Type':'image/webp','Content-Security-Policy':"default-src 'none'; sandbox"}});
});
