import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261002_kinto_deals_v1_g4a_vendor_products_off.sql',import.meta.url),'utf8');
test('picker scopes verified vendor and uses literal product or barcode search',()=>{
 assert.match(sql,/private\.require_vendor_session\(p_session_token\)/);
 assert.match(sql,/p\.store_id=v_store/);
 assert.match(sql,/position\(lower\(v_query\) in lower\(coalesce\(p\.product_name,''\)\)\)>0/);
 assert.match(sql,/position\(lower\(v_query\) in lower\(coalesce\(p\.barcode,''\)\)\)>0/);
 assert.match(sql,/p_limit not between 1 and 50/);
});
test('no campaign writes, browser grants or legacy hooks',()=>{
 assert.match(sql,/security definer/);
 assert.doesNotMatch(sql,/\b(insert|update|delete|truncate)\s+(into\s+|from\s+)?public\./i);
 assert.doesNotMatch(sql,/checkout_independent_vendor_orders|alter table public\.orders|create trigger/i);
 assert.match(sql,/revoke all on function/);
});
