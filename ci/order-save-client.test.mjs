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
