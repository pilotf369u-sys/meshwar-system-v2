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
