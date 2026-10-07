import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261002_kinto_deals_v1_g3b_vendor_review_feed_off.sql',import.meta.url),'utf8');
test('verified store identity and closed data scope',()=>{
 assert.match(sql,/v_store:=private\.require_vendor_session\(p_session_token\)/);
 assert.match(sql,/where s\.store_id=v_store/);
 assert.match(sql,/join public\.kinto_deals_v1_campaigns c on c\.id=s\.campaign_id and c\.store_id=s\.store_id/);
 assert.doesNotMatch(sql,/p_store_id|p_customer_id/);
});
test('read only and no legacy commerce coupling',()=>{
 for(const pattern of [/\b(insert|update|delete|truncate)\s+(into\s+|from\s+)?public\./i,/\borders\b/i,/checkout_independent_vendor_orders/i,/admin_send_customer_notice_v420/i,/merchant_deals_enabled/i])assert.doesNotMatch(sql,pattern);
 assert.match(sql,/security definer/);
 assert.match(sql,/revoke all on function/);
});
test('no premature active display',()=>{
 assert.match(sql,/when s\.review_state='acknowledged' and c\.status='active' then 'active'/);
 assert.match(sql,/when s\.review_state='acknowledged' then 'approved_not_published'/);
 assert.match(sql,/rejection_reason/);
});
