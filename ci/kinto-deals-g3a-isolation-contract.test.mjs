import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261002_kinto_deals_v1_g3a_admin_moderation_off.sql',import.meta.url),'utf8');
test('G3A remains isolated and does not activate commerce',()=>{
 for(const forbidden of [/alter\s+table\s+public\.orders\b/i,/create\s+trigger[^;]*\bon\s+public\.orders\b/i,/update\s+public\.kinto_deals_v1_flags/i,/admin_send_customer_notice_v420\s*\(/i,/checkout_independent_vendor_orders/i])assert.doesNotMatch(sql,forbidden);
 assert.match(sql,/alter table public\.kinto_deals_v1_review_events enable row level security/i);
 assert.match(sql,/revoke all on public\.kinto_deals_v1_review_events from public,anon,authenticated/i);
});
test('G3A authenticates and guards both admin endpoints',()=>{
 assert.equal((sql.match(/private\.require_admin_session_v147\(p_session_token\)/g)||[]).length,2);
 assert.match(sql,/for update/i);
 assert.match(sql,/DEALS_STALE_OR_ALREADY_REVIEWED/);
 assert.match(sql,/DEALS_SUPERSEDED_SUBMISSION/);
 assert.match(sql,/DEALS_REJECTION_REASON_REQUIRED/);
 assert.match(sql,/submission_id uuid not null unique/);
});
test('G3A never pretends approval is publication or customer broadcast',()=>{
 assert.match(sql,/merchant_push_sent',false/);
 assert.match(sql,/customer_broadcast_sent',false/);
 assert.match(sql,/review_state=case when p_decision='approved' then 'acknowledged'/);
 assert.doesNotMatch(sql,/status='active'/i);
});
