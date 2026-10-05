import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('../js/admin-kinto-deals-g3f.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../admin-dashboard.html',import.meta.url),'utf8');
test('isolated admin script and existing navigation',()=>{
 assert.match(html,/G10: embedded admin campaign UI synchronized/);
 assert.match(html,/حالة الإعلان:/);
 assert.doesNotMatch(html,/إيقاف عرض جميع الإعلانات|تحديث حالة نشر الإعلانات/);
 assert.match(ui,/showSection\('kintoDealsG3f'\)/);
 assert.match(ui,/KintoAdminSessionV147\?\.read\(\)\?\.token/);
 assert.match(ui,/ensureCustomerSupabase\(\)/);
});
test('moderation uses only verified RPCs, no direct tables or customer broadcast',()=>{
 for(const fn of ['kinto_deals_v1_admin_inbox_g3','kinto_deals_v1_admin_detail_g3','kinto_deals_v1_admin_decide_g3'])assert.ok(ui.includes(fn));
 assert.doesNotMatch(ui,/\.from\(|admin_send_customer_notice|checkout_independent_vendor_orders|localStorage/);
 assert.match(ui,/p_expected_revision:d\.revision/);
 assert.match(ui,/r\.length<3/);
 assert.match(ui,/confirm\(/);
});
