import {createClient} from 'npm:@supabase/supabase-js@2';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
Deno.serve(async req=>{
 if(req.method!=='GET')return new Response(null,{status:405});
 const id=new URL(req.url).searchParams.get('campaign_id');
 if(!id||!UUID.test(id))return new Response(null,{status:400});
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!key)return new Response(null,{status:503});
 const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 // Exact-campaign SQL gate retains all G10 approval, publication and date conditions.
 const {data:path,error:pathError}=await sb.rpc('kinto_deals_v1_public_ad_path_g13',{p_campaign_id:id});
 if(pathError||!path)return new Response(null,{status:404,headers:{'Cache-Control':'no-store'}});
 const {data:file,error:downloadError}=await sb.storage.from('kinto-merchant-campaign-ads').download(path);
 if(downloadError||!file)return new Response(null,{status:404,headers:{'Cache-Control':'no-store'}});
 return new Response(file.stream(),{status:200,headers:{'Content-Type':'image/webp','Cache-Control':'public, max-age=30','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
});
