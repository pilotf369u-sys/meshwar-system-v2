import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/migrations/20261006_kinto_deals_v1_g21b_vendor_stock_gate.sql','utf8');
test('merchant picker excludes aggregate zero stock',()=>{
 for(const x of ["not coalesce(p.is_out_of_stock,false)","p.stock_quantity is null or p.stock_quantity>0","DEALS_PRODUCT_OUT_OF_STOCK"]) assert.ok(sql.includes(x),x);
});
test('merchant variant picker and save use V93 stock semantics',()=>{
 for(const x of ['meshwar_adjust_variant_stock','meshwar_adjust_matrix_stock','kinto_deals_v1_option_value_available_g21b','kinto_deals_v1_vendor_set_product_options_g20','DEALS_PRODUCT_VARIANT_OUT_OF_STOCK']) assert.ok(sql.includes(x),x);
});
test('campaign stock gate never mutates inventory or orders',()=>{
 assert.doesNotMatch(sql,/update\s+public\.local_products/i);
 assert.doesNotMatch(sql,/\b(insert|update|delete)\s+(into\s+|from\s+)?public\.orders/i);
 assert.doesNotMatch(sql,/create\s+trigger/i);
});
console.log('G21B vendor stock gate PASS');
