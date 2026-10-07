import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/migrations/20261006_kinto_deals_v1_g21_availability_history.sql','utf8');
const html=readFileSync('vendor-dashboard-v2.html','utf8');
const ui=readFileSync('js/vendor-kinto-deals-g3g.js','utf8');
test('public feed fails closed on campaign stock availability',()=>{
 assert.match(sql,/kinto_deals_v1_unavailable_reason_g21\(c\.id\) is null/);
 for(const x of ['meshwar_adjust_variant_stock','meshwar_adjust_matrix_stock','gift_out_of_stock','product_out_of_stock','quota_exhausted']) assert.ok(sql.includes(x),x);
 assert.doesNotMatch(sql,/update\s+public\.local_products/i);
 assert.doesNotMatch(sql,/update\s+public\.orders/i);
});
test('merchant history is separate from campaign composer',()=>{
 for(const x of ['vendorTabBtn-dealsHistory','vendorTab-dealsHistory','سجل الحملات']) assert.ok(html.includes(x),x);
 assert.ok(ui.includes("vendorTabBtn-dealsHistory"));
 assert.ok(ui.includes('سبب انتهاء الحملة'));
});
console.log('G21 availability/history contract PASS');
