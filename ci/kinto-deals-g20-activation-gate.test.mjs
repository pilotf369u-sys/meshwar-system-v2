import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const a=readFileSync('supabase/migrations/20261006_kinto_deals_v1_g20_activate_after_gift_checkout.sql','utf8');
assert.ok(a.includes('DEALS_GIFT_PIPELINE_NOT_READY'));
assert.ok(a.includes('trg_kinto_deals_v1_gift_insert_g5f'));
assert.ok(a.includes('kinto_deals_v1_redemption_lifecycle_g5i'));
assert.ok(a.includes('set enabled=true'));
assert.ok(a.indexOf('DEALS_GIFT_PIPELINE_NOT_READY') < a.indexOf('set enabled=true'));
console.log('G20 activation gate PASS');