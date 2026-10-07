import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
const sql=readFileSync('supabase/migrations/20261006_kinto_deals_v1_g21c_multi_option_save_fix.sql','utf8');
test('draft save no longer shadows PLpgSQL record e',()=>{assert.ok(sql.includes('v_item record'));assert.ok(sql.includes('jsonb_each(p_product_options) j'));assert.doesNotMatch(sql,/declare[^;]*\be record\b/i)});
test('option availability probes concrete combinations with both V93 helpers',()=>{assert.ok(sql.includes('for candidate in'));assert.ok(sql.includes('meshwar_adjust_variant_stock'));assert.ok(sql.includes('meshwar_adjust_matrix_stock'))});
test('fix never mutates inventory/orders',()=>{assert.doesNotMatch(sql,/update\s+public\.local_products/i);assert.doesNotMatch(sql,/\b(insert|update|delete)\s+(into\s+|from\s+)?public\.orders/i)});
