import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
const s=readFileSync('supabase/migrations/20261003_kinto_deals_v1_g5i_ONE_RUN_OFF.sql','utf8');
assert.equal((s.match(/^begin;$/gm)||[]).length,1);
assert.equal((s.match(/^commit;$/gm)||[]).length,1);
assert.ok(s.indexOf('create or replace function private.kinto_deals_v1_reserve_canonical_order_g5')<s.indexOf('create or replace function private.kinto_deals_v1_redemption_lifecycle_g5i'));
assert.ok(s.includes('for update nowait'));
assert.ok(!s.includes("state in ('pending','confirmed')"));
assert.ok(s.includes('DEALS_PAID_ALLOCATION_EXHAUSTED'));
console.log('G5I single-transaction bundle PASS');
