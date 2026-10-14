// Run with: node tests/payment-approval-gate-static.test.cjs
// Static contract checks only. Does not claim live database security or integration coverage.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const employee = read('employee-dashboard.html');
const admin = read('admin-dashboard.html');
const sql = read('supabase/migrations/20261014_kinto_payment_gate_v1_REVIEW_ONLY.sql');
for (const [name, source, actor, session] of [
  ['employee', employee, 'employee', 'KintoEmployeeSessionV143'],
  ['admin', admin, 'admin', 'KintoAdminSessionV147'],
]) {
  assert.match(source, /payload\.status==='تم التسديد'&&o\.status!=='تم التسديد'/, name+' paid transition branch');
  assert.ok(source.includes("p_actor:'"+actor+"'"), name+' actor');
  assert.ok(source.includes(session+'?.read?.()?.token'), name+' session token');
  assert.ok(source.includes("sb.rpc('kinto_approve_paid_order_v1'"), name+' RPC');
  assert.ok(source.includes("sb.from('orders').update(payload)"), name+' other statuses retained');
}
for (const needle of [
  "CREATE TRIGGER trg_kinto_paid_transition_guard_v1",
  "NEW.status = 'تم التسديد'",
  "KINTO_PAYMENT_APPROVAL_REQUIRED",
  "private.require_employee_session_v143",
  "private.require_admin_session_v147",
  "p_expected_status",
  "FOR UPDATE",
  "KINTO_ORDER_ALREADY_PAID",
  "KINTO_PAYMENT_PATCH_FIELDS_DENIED",
  "kinto_paid_approval_audit_v1",
  "KINTO_PAYMENT_FINANCIAL_FIELDS_CHANGE_DENIED",
  "KINTO_PAYMENT_DETAILS_CHANGE_DENIED",
  "KINTO_PAYMENT_STOCK_MARKER_CHANGE_DENIED",
  "REVOKE ALL ON FUNCTION public.kinto_approve_paid_order_v1",
]) assert.ok(sql.includes(needle), 'SQL missing '+needle);
console.log('PASS: static payment-approval wiring contracts (not DB integration tests)');
