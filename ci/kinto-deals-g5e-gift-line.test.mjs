import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
const sql=readFileSync('supabase/migrations/20261002_kinto_deals_v1_g5e_private_gift_line_off.sql','utf8');
for(const term of ['security definer','gift_selected_options','gift_original_unit_price_local','gift_discount_local',"'unit_price_local',0","'line_total_local',0","'quantity',1",'DEALS_GIFT_OUT_OF_STOCK','gift_discount_percent', 'revoke all on function'])assert.ok(sql.includes(term),term);
assert.ok(!/create\s+trigger/i.test(sql));assert.ok(!/update\s+public\.orders/i.test(sql));assert.ok(!/grant\s+execute/i.test(sql));
console.log('G5E gift line isolation contract PASS');
