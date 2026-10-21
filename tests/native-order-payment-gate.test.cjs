'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync('js/external-shipping-native-order-render-v1.js', 'utf8');
const employee = source.split('window.saveOrderRow=async function(encodedId){')[1].split('function installAdmin(){')[0];
const admin = source.split('window.saveAdminOrderRow=async function(encodedId){')[1].split('if(screen===\'employee\')installEmployee()')[0];
for (const [name, code, actor] of [['employee',employee,'employee'],['admin',admin,'admin']]) {
  assert.ok(code.includes("payload.status==='تم التسديد'&&o.status!=='تم التسديد'"), name+' paid transition condition');
  assert.ok(code.includes("sb.rpc('kinto_approve_paid_order_v1'"), name+' RPC');
  assert.ok(code.includes("p_actor:'"+actor+"'"), name+' actor');
  assert.ok(code.includes('p_expected_status:o.status'), name+' optimistic concurrency');
  assert.ok(code.includes('...approvalPatch'), name+' allowed patch');
  assert.ok(code.includes('const {external_shipping_fee,external_shipping_currency,...approvalPatch}=payload'), name+' shipping separated');
  assert.ok(code.includes(".update({external_shipping_fee,external_shipping_currency})"), name+' shipping saved without status');
  assert.ok(code.includes(".update(payload).eq('id',id)"), name+' non-paid save remains');
}
assert.ok(employee.includes('checkEmployeePaymentStockV53(o)'), 'employee stock preflight remains');
assert.ok(employee.includes('KintoEmployeeSessionV143'), 'employee session token');
assert.ok(admin.includes('KintoAdminSessionV147'), 'admin session token');
console.log('Native order paid transition routing contracts passed');
