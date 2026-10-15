'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ui=fs.readFileSync('js/external-shipping-native-order-render-v1.js','utf8');
const sql=fs.readFileSync('sql/kinto-external-shipping-guard-v1.sql','utf8');
for(const [actor,code] of [
 ['employee',ui.split('window.saveOrderRow=async function(encodedId){')[1].split('function installAdmin(){')[0]],
 ['admin',ui.split('window.saveAdminOrderRow=async function(encodedId){')[1].split("if(screen==='employee')installEmployee()")[0]]
]){
 assert.equal((code.match(/sb\.rpc\('kinto_approve_external_shipping_v1'/g)||[]).length,2,actor+' guarded paid and non-paid');
 assert.ok(code.includes("p_actor:'"+actor+"'"),actor+' actor');
 assert.ok(code.includes('p_expected_fee:o.external_shipping_fee'),actor+' old amount');
 assert.ok(code.includes('p_expected_currency:o.external_shipping_currency'),actor+' old currency');
 assert.ok(code.includes('p_expected_status:payload.status'),actor+' status check');
 assert.ok(code.includes("sb.rpc('kinto_approve_paid_order_v1'"),actor+' retains paid approval');
 assert.ok(code.includes("sb.rpc('kinto_approve_payment_type_v1'"),actor+' retains payment type guard');
 assert.ok(code.includes('...orderPatch'),actor+' strips shipping fields from direct update');
}
assert.match(sql,/BEFORE UPDATE OF external_shipping_fee, external_shipping_currency/);
assert.match(sql,/private\.require_employee_session_v143/);
assert.match(sql,/private\.require_admin_session_v147/);
assert.match(sql,/private\.kinto_external_shipping_audit_v1/);
assert.match(sql,/FOR UPDATE/);
console.log('External shipping fee protection contract passed');
