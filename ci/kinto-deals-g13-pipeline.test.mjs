import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('merchant ad remains in a separate private bucket',()=>{
 const sql=read('supabase/migrations/20261004_kinto_deals_v1_g13a_private_ad_assets.sql');
 assert.match(sql,/kinto-merchant-campaign-ads/);
 assert.match(sql,/false,204800/);
 assert.match(sql,/enable row level security/);
 assert.equal((sql.match(/commit;/g)||[]).length,1);
 assert.match(sql,/G13_BUCKET_CONFIG_INVALID/);
 assert.match(sql,/kinto_g13_ad_path/);
 assert.doesNotMatch(sql,/customer-notice-media|coupon/);
});
test('upload checks draft ownership, status, image signature and dimensions',()=>{
 const src=read('supabase/functions/kinto-deals-ad-media-g13/index.ts');
 for(const term of ['kinto_deals_v1_vendor_drafts_g4','CAMPAIGN_NOT_OWNED','DRAFT_REQUIRED','INVALID_WEBP','INVALID_DIMENSIONS','kinto_deals_v1_attach_ad_g13','ATTACH_DENIED'])assert.ok(src.includes(term),term);
});
test('public image uses exact campaign publication gate and disables caching',()=>{
 const src=read('supabase/functions/kinto-deals-ad-public-g13/index.ts');
 const gate=read('supabase/migrations/20261004_kinto_deals_v1_g13d_public_ad_gate.sql');
 assert.match(src,/kinto_deals_v1_public_ad_path_g13/);
 assert.match(src,/Cache-Control':'no-store/);
 assert.match(gate,/kinto_deals_v1_public_feed_g7/);
 assert.match(gate,/campaign_id/);
 assert.match(gate,/from public\.kinto_deals_v1_public_feed_g7\(v_store_id\) as f/);
 assert.match(gate,/f\.campaign_id=p_campaign_id/);
 assert.doesNotMatch(gate,/jsonb_array_elements|G13_PUBLIC_FEED_MUST_RETURN_JSON/);
 assert.match(gate,/G13_REQUIRES_G10_PUBLIC_FEED_UUID_SIGNATURE/);
 const attach=read('supabase/migrations/20261004_kinto_deals_v1_g13b_attach_ad.sql');
 assert.match(attach,/G13_REQUIRES_G4_VENDOR_DRAFT_SIGNATURE/);
 for(const sql of [gate,attach]){
  assert.match(sql,/do \$g13check\$ begin/);
  assert.match(sql,/end \$g13check\$;/);
  assert.doesNotMatch(sql,/do \$ begin/);
 }
});
test('cleanup is secret-guarded and limited to the merchant ad bucket',()=>{
 const src=read('supabase/functions/kinto-deals-ad-cleanup-g13/index.ts');
 assert.match(src,/DEALS_AD_CLEANUP_SECRET/);
 assert.match(src,/kinto_deals_v1_queue_expired_ads_g13/);
 assert.match(src,/\.eq\('object_path',item.object_path\)/);
 assert.match(src,/from\('kinto-merchant-campaign-ads'\)/);
 assert.doesNotMatch(src,/customer-notice-media|coupon/);
});
