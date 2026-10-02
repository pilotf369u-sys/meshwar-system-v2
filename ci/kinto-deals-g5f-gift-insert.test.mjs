import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
const sql=readFileSync('supabase/migrations/20261002_kinto_deals_v1_g5f_gift_insert_context_off.sql','utf8');
for(const term of ['before insert on public.orders','app.kinto_deals_gift_campaign_id','app.kinto_deals_verified_customer_id','merchant_deals_enabled','new.customer_id is distinct from v_customer_id::text','DEALS_GIFT_CAMPAIGN_NOT_APPROVED_ACTIVE','DEALS_GIFT_THRESHOLD_NOT_MET','DEALS_GIFT_COMBINED_STOCK_INSUFFICIENT','kinto_deals_v1_gift_line_g5e','deal_gift_insert_contract','v_paid||jsonb_build_array(v_gift)','return new'])assert.ok(sql.includes(term),term);
assert.ok(!/set_config\s*\(/i.test(sql),'no checkout context set in migration');
assert.ok(!/update\s+public\.orders/i.test(sql),'no post-insert details mutation');
assert.ok(!/update\s+public\.local_products/i.test(sql),'no stock mutation at order insertion');
console.log('G5F guarded gift injection static contract PASS (15 checks)');
