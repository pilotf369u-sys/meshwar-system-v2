'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ui=fs.readFileSync('js/external-shipping-native-order-render-v1.js','utf8');
const sql=fs.readFileSync('sql/kinto-payment-type-guard-v1.sql','utf8');
const employee=ui.split('window.saveOrderRow=async function(encodedId){')[1].split('function installAdmin(){')[0];
const admin=ui.split('window.saveAdminOrderRow=async function(encodedId){')[1].split("if(screen==='employee')installEmployee()")[0];
for(const [actor,code] of [['employee',employee],['admin',admin]]){
  assert.ok(code.includes("payload.delivery_payment_type!==o.delivery_payment_type"),actor+' detects type change');
  assert.ok(code.includes("sb.rpc('kinto_approve_payment_type_v1'"),actor+' uses protected RPC');
  assert.ok(code.includes("p_actor:'"+actor+"'"),actor+' session actor');
  assert.ok(code.includes('p_expected_status:o.status'),actor+' checks status');
  assert.ok(code.includes('p_expected_type:o.delivery_payment_type'),actor+' checks prior type');
  assert.ok(code.includes("sb.rpc('kinto_approve_paid_order_v1'"),actor+' retains paid gate');
}
assert.match(sql,/BEFORE UPDATE OF delivery_payment_type ON public\.orders/);
assert.match(sql,/private\.kinto_paid_transition_permits_v1/);
assert.match(sql,/private\.require_employee_session_v143/);
assert.match(sql,/private\.require_admin_session_v147/);
assert.match(sql,/private\.kinto_payment_type_change_audit_v1/);
assert.match(sql,/FOR UPDATE/);
console.log('Payment type guard contract passed');
