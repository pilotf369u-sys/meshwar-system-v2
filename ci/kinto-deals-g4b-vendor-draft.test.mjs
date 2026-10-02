import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261002_kinto_deals_v1_g4b_vendor_draft_off.sql',import.meta.url),'utf8');
test('vendor identity, ownership and version lock',()=>{
 for(const part of ['private.require_vendor_session(p_session_token)','p.store_id=v_store','where id=p_campaign_id and store_id=v_store for update','v_c.updated_at is distinct from p_expected_updated_at','DEALS_REVIEWED_OR_SUBMITTED_DRAFT_LOCKED','count(distinct id)','DEALS_CHOOSE_N_EXCEEDS_PRODUCTS'])assert.ok(sql.includes(part),part);
});
test('draft only, no review submission, publication or legacy writes',()=>{
 assert.match(sql,/security definer/);
 assert.match(sql,/'draft'/);
 assert.match(sql,/'submitted',false,'published',false/);
 assert.doesNotMatch(sql,/\b(insert into|update|delete from)\s+public\.(orders|local_products|kinto_deals_v1_submissions|kinto_deals_v1_review_events)/i);
 assert.doesNotMatch(sql,/checkout_independent_vendor_orders|admin_send_customer_notice|create trigger/i);
 assert.match(sql,/revoke all on function/);
});
