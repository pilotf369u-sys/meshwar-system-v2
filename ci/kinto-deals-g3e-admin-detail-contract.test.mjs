import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261002_kinto_deals_v1_g3e_admin_detail_off.sql',import.meta.url),'utf8');
test('admin-only details and exact verified product fields',()=>{
 assert.match(sql,/private\.require_admin_session_v147\(p_session_token\)/);
 for(const name of ['product_name','image_url','barcode','store_name','logo_url','gift_product_id','terms_snapshot','summary_snapshot','revision'])assert.ok(sql.includes(name),name);
 assert.match(sql,/p\.store_id=\(v_detail->>'store_id'\)::uuid/);
 assert.match(sql,/p\.store_id=c\.store_id/);
});
test('no writes, no order hooks and media not invented',()=>{
 assert.doesNotMatch(sql,/\b(insert|update|delete|truncate)\s+(into\s+|from\s+)?public\./i);
 assert.doesNotMatch(sql,/checkout_independent_vendor_orders|admin_send_customer_notice_v420/i);
 assert.match(sql,/'campaign_image_url',null/);
 assert.match(sql,/revoke all on function/);
 assert.match(sql,/security definer/);
});
