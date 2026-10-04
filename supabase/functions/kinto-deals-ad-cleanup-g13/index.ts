import {createClient} from 'npm:@supabase/supabase-js@2';
Deno.serve(async req=>{
 if(req.method!=='POST')return new Response(null,{status:405});
 const secret=Deno.env.get('DEALS_AD_CLEANUP_SECRET');
 if(!secret||secret.length<32||req.headers.get('x-cleanup-secret')!==secret)return new Response(null,{status:403});
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!key)return new Response(null,{status:503});
 const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {error:queueError}=await sb.rpc('kinto_deals_v1_queue_expired_ads_g13');
 if(queueError){console.error('G13_QUEUE_FAILED',queueError);return new Response(null,{status:500})}
 const {data:items,error:listError}=await sb.from('kinto_deals_v1_ad_cleanup_g13').select('object_path,campaign_id,attempts').is('cleaned_at',null).order('queued_at').limit(40);
 if(listError){console.error('G13_LIST_FAILED',listError);return new Response(null,{status:500})}
 let removed=0,failed=0;
 for(const item of items||[]){
  try{
   // Never remove an object still referenced by a live campaign.
   const {data:asset,error:assetError}=await sb.from('kinto_deals_v1_ad_assets_g13').select('object_path').eq('campaign_id',item.campaign_id).maybeSingle();
   if(assetError)throw assetError;
   if(asset?.object_path===item.object_path){
    const {data:campaign,error:campaignError}=await sb.from('kinto_deals_v1_campaigns').select('ends_at').eq('id',item.campaign_id).maybeSingle();
    if(campaignError)throw campaignError;
    if(campaign&&new Date(campaign.ends_at)>new Date())continue;
   }
   const {error:removeError}=await sb.storage.from('kinto-merchant-campaign-ads').remove([item.object_path]);
   if(removeError)throw removeError;
   // Conditional deletion protects a concurrent replacement.
   const {error:detachError}=await sb.from('kinto_deals_v1_ad_assets_g13').delete().eq('campaign_id',item.campaign_id).eq('object_path',item.object_path);
   if(detachError)throw detachError;
   const {error:markError}=await sb.from('kinto_deals_v1_ad_cleanup_g13').update({cleaned_at:new Date().toISOString(),last_error:null}).eq('object_path',item.object_path);
   if(markError)throw markError;
   removed++;
  }catch(e){
   failed++;console.error('G13_CLEANUP_RETRY',item.object_path,e);
   await sb.from('kinto_deals_v1_ad_cleanup_g13').update({attempts:item.attempts+1,last_error:String(e).slice(0,500)}).eq('object_path',item.object_path);
  }
 }
 return new Response(JSON.stringify({ok:failed===0,removed,failed}),{status:failed?207:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
});
