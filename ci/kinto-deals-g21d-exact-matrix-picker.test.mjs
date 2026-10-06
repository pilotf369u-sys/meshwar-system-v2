import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
const sql=readFileSync('supabase/migrations/20261006_kinto_deals_v1_g21d_exact_matrix_picker.sql','utf8');
const js=readFileSync('js/vendor-kinto-deals-g4c-draft.js','utf8');
test('server returns only exact combinations that survive V93 probes',()=>{for(const x of ['available_combinations','kinto_deals_v1_combo_available_g21d','meshwar_adjust_variant_stock','meshwar_adjust_matrix_stock'])assert.ok(sql.includes(x),x)});
test('merchant dropdowns cascade from exact combinations',()=>{for(const x of ['availableCombinations','const refresh=','allowed=new Set','available_combinations'])assert.ok(js.includes(x),x)});
test('no order or inventory mutation',()=>{assert.doesNotMatch(sql,/update\s+public\.local_products/i);assert.doesNotMatch(sql,/\b(insert|update|delete)\s+(into\s+|from\s+)?public\.orders/i)});
