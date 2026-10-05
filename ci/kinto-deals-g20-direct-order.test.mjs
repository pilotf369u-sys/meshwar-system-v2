import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const sql=fs.readFileSync('supabase/migrations/20261005_kinto_deals_v1_g20_direct_order_pipe.sql','utf8');
test('reuses canonical checkout, not a second order engine',()=>{assert.match(sql,/kinto_deals_v1_checkout_no_gift_g5d\(/);assert.doesNotMatch(sql,/insert\s+into\s+public\.orders/i);});
test('campaign/store scope is server enforced',()=>{assert.match(sql,/kinto_deals_v1_products/);assert.match(sql,/DEALS_DIRECT_ORDER_CAMPAIGN_SCOPE_INVALID/);assert.match(sql,/v_campaign\.store_id/);});
test('does not mutate status or stock',()=>{assert.doesNotMatch(sql,/set\s+status\s*=/i);assert.doesNotMatch(sql,/update\s+public\.local_products/i);assert.doesNotMatch(sql,/meshwar_adjust_(variant|matrix)_stock/i);});
test('adds campaign identity without changing KN',()=>{assert.match(sql,/'deal_campaign_id'/);assert.match(sql,/'deal_order_contract','g20-direct-campaign-order-v1'/);assert.doesNotMatch(sql,/set\s+order_code\s*=/i);});
test('keeps verified session and idempotency key',()=>{assert.match(sql,/require_customer_review_session\(p_session_token\)/);assert.match(sql,/p_request_id uuid/);});


test('G20 server enforces one unit and merchant-frozen selected options',()=>{
 assert.match(sql,/coalesce\(x\.item->>'quantity',''\) <> '1'/);
 assert.match(sql,/'quantity',1/);
 assert.match(sql,/'selected_options',coalesce\(cp\.selected_options,'\{\}'::jsonb\)/);
 assert.match(sql,/p_customer_shipping,v_canonical_items\)/);
 assert.doesNotMatch(sql,/p_customer_shipping,p_items\);/);
});

test('G20 rejects duplicate campaign products so one selected product is exactly one unit',()=>{
 assert.match(sql,/DEALS_DIRECT_ORDER_DUPLICATE_PRODUCT/);
 assert.match(sql,/count\(distinct \(x\.item->>'product_id'\)::uuid\)/);
});
