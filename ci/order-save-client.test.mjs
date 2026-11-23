import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {controllerSource} from './order-save-controller-harness.mjs';
test('all original and external-shipping staff save handlers use sessions and price concurrency',()=>{
 for(const role of ['admin','employee'])for(const native of [false,true]){
  const s=controllerSource(role,native);
  assert(s.includes("rpc('kinto_save_staff_order_session_v1'"));
  assert(s.includes('p_expected_price:o.total_price'));assert(s.includes('p_expected_currency:o.currency'));
  assert(!/from\('orders'\)\.update\((?:payload|orderPatch)\)/.test(s));
  assert(s.includes("rpc('kinto_approve_paid_order_v1'"));
 }
 assert(fs.readFileSync('external-shipping-shell.html','utf8').includes('external-shipping-native-order-render-v1.js?v=20261021-receipt-badges-v1'));
});
test('price guard is staged separately from additive SQL, and rollback preserves existing guards',()=>{
 const additive=fs.readFileSync('sql/kinto-order-save-session-v1.sql','utf8');
 assert(!/CREATE TRIGGER/i.test(additive));
 const lockdown=fs.readFileSync('sql/kinto-order-price-lockdown-v1.sql','utf8');
 assert(lockdown.includes('BEFORE UPDATE OF total_price,currency'));
 const rollback=fs.readFileSync('sql/kinto-order-price-rollback-v1.sql','utf8');
 assert(!/UPDATE public|DELETE FROM|REVOKE|DROP FUNCTION/i.test(rollback));
});

test('employee status save does not submit unrelated order details',()=>{
 const src=controllerSource('employee',false);
 assert(src.includes('if(parcelsCount!==orderParcelsCount(o))'),'details patch is conditional on parcel-count change');
 assert(!src.includes('payload.details=JSON.stringify(nextDetails);try{'),'no unconditional details overwrite');
 assert(src.includes('payload.details=JSON.stringify(nextDetails)'),'actual parcel-count edits remain supported');
 const guard=fs.readFileSync('sql/kinto-order-save-session-v1.sql','utf8');
 assert(guard.includes("RAISE EXCEPTION 'ORDER_SAVE_DETAILS_DENIED'"),'database denies changes outside parcel count');
 assert(guard.includes("old_details-'parcels_count'"),'server protects all unrelated details');
});

test('employee unified status aliases are mapped to original server-allowed labels only',()=>{
 const src=controllerSource('employee',false);
 const allowed=fs.readFileSync('sql/kinto-order-save-session-v1.sql','utf8');
 const mapping={"بانتظار رد الموظف":"انتظار رد الموظف","بانتظار تأكيد الدفع":"تمت الموافقة - بانتظار الدفع","مخزن الشركة":"مخزن شركة"};
 for(const [label,canonical] of Object.entries(mapping)){
   assert(src.includes("'"+label+"':'"+canonical+"'"),'missing alias '+label);
   assert(allowed.includes("'"+canonical+"'"),'server lacks canonical status '+canonical);
 }
 assert(src.indexOf('status=canonicalStatus[status]||status') < src.indexOf('payload={status,'),'normalize before patch');
 for(const forbidden of ['محولة إلى الفرع','مستحق مكافأة','رفض التسليم','ملغية من قبل العميل']){
   assert(!src.includes("'"+forbidden+"':"),'special workflow must not be remapped in generic save: '+forbidden);
 }
 const admin=controllerSource('admin',false);
 for(const [label,canonical] of Object.entries(mapping))assert(admin.includes("'"+label+"':'"+canonical+"'"),'admin missing alias '+label);
 assert(admin.indexOf('status=canonicalStatus[status]||status') < admin.indexOf('payload={reference_order_no:'),'normalize admin before patch');
 assert(src.includes("rpc('kinto_save_staff_order_session_v1'"),'trusted RPC unchanged');
 assert(src.includes("rpc('kinto_approve_paid_order_v1'"),'paid approval RPC unchanged');
});

test('obsolete staff reward status removed only from unified order dropdowns',()=>{
 for(const role of ['employee','admin']){
  const source=fs.readFileSync(role+'-dashboard.html','utf8');
  const block=source.split('/* UNIFIED_ORDER_STATUS_DROPDOWN_V1 */')[1]?.split('/* UNIFIED_ORDER_STATUS_DROPDOWN_V1_')[0]||'';
  assert(block.includes("'محولة إلى الفرع'"),'branch transfer option remains in '+role);
  assert(block.includes("'مندوب'"),'courier option remains in '+role);
  assert(!block.includes("'مستحق مكافأة'"),'obsolete reward option removed from '+role);
 }
});

test('admin branch transfer preflight uses the rendered row identifiers',()=>{
 const page=fs.readFileSync('admin-dashboard.html','utf8');
 const wrapper=page.split('/* UNIFIED_ORDER_STATUS_DROPDOWN_V1_ADMIN */')[1]?.split('</script>')[0]||'';
 assert(page.includes('id="adminStatus-'), 'admin status control exists');
 assert(page.includes('id="adminBranch-'), 'admin branch selector exists');
 assert(wrapper.includes("document.getElementById('adminStatus-'+encodedId)"),'reads real status control');
 assert(wrapper.includes("document.getElementById('adminBranch-'+encodedId)"),'reads real branch selector');
 assert(!wrapper.includes("document.getElementById('admin-status-'+encodedId)"),'no incorrect old ID');
 assert(!wrapper.includes("document.getElementById('admin-branch-'+encodedId)"),'no incorrect old ID');
 assert(wrapper.includes("if(statusEl?.value==='محولة إلى الفرع')"),'branch precondition exists');
});
test('branch and courier SQL guard changes are reversible and narrow',()=>{
 const apply=fs.readFileSync('docs/KINTO_STAFF_BRANCH_COURIER_GUARDED_SQL_REVIEW_ONLY_20261123.sql','utf8');
 const restore=fs.readFileSync('docs/KINTO_STAFF_BRANCH_COURIER_REVERSE_SQL_REVIEW_ONLY_20261123.sql','utf8');
 const schema=fs.readFileSync('sql/kinto-order-save-session-v1.sql','utf8');
 assert(apply.includes("'886b9817c86af7e067d756e9d9f3414c'"),'live body hash gate');
 assert(apply.includes("typed.status='محولة إلى الفرع'"),'branch requires selected branch');
 assert(apply.includes("typed.status='مندوب'"),'courier requires selected courier');
 assert(apply.includes('ORDER_SAVE_BRANCH_REQUIRED'));
 assert(apply.includes('ORDER_SAVE_COURIER_REQUIRED'));
 assert(apply.includes('SELECT 1 FROM public.branches'),'branch lookup');
 assert(apply.includes('SELECT 1 FROM public.couriers'),'courier lookup');
 assert(apply.includes('coalesce(c.is_active,true)'),'courier active check');
 assert(apply.includes('EXECUTE definition'),'updates actual live definition');
 assert(!/\\b(?:ALTER|CREATE|DROP)\\s+TABLE\\b/i.test(apply),'no table DDL');
 assert(!/\\b(?:UPDATE|DELETE|INSERT)\\s+public\\.orders\\b/i.test(apply),'no orders mutations');
 assert(restore.includes("KINTO_BRANCH_RESTORE_ORIGINAL_HASH_MISMATCH"),'restore guarded');
 assert(schema.includes('ORDER_SAVE_STATUS_DENIED'),'preserves whitelist');
});
