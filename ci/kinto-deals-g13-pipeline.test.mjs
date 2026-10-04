import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('merchant ad remains in a separate private bucket',()=>{
 const sql=read('supabase/migrations/20261004_kinto_deals_v1_g13a_private_ad_assets.sql');
 assert.match(sql,/kinto-merchant-campaign-ads/);
 assert.match(sql,/false,204800/);
 assert.match(sql,/enable row level security/);
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
 for(const term of ["pub.published=true","c.status='submitted'","st.status='active'","latest.review_state='acknowledged'","e.decision='approved'"])assert.ok(gate.includes(term),term);
});
test('cleanup is secret-guarded and limited to the merchant ad bucket',()=>{
 const src=read('supabase/functions/kinto-deals-ad-cleanup-g13/index.ts');
 assert.match(src,/DEALS_AD_CLEANUP_SECRET/);
 assert.match(src,/kinto_deals_v1_queue_expired_ads_g13/);
 assert.match(src,/\.eq\('object_path',item.object_path\)/);
 assert.match(src,/from\('kinto-merchant-campaign-ads'\)/);
 assert.doesNotMatch(src,/customer-notice-media|coupon/);
});
