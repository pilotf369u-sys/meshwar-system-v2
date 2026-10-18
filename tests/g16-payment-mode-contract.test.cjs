'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('admin-dashboard.html','utf8');
const ui=fs.readFileSync('js/admin-payment-methods-g16.js','utf8');
const sql=fs.readFileSync('supabase/migrations/20261018165704_g16_payment_mode_controls.sql','utf8');

assert.match(html,/id="g16PaymentMode"/,'mode selector exists in the current G16 tab');
assert.match(html,/id="g16GatewayEnvironment"/,'gateway environment control exists');
assert.match(html,/option value="manual">النظام اليدوي \(الافتراضي\)/,'manual mode is the visible default');
assert.match(html,/إيقاف استقبال المدفوعات الإلكترونية/,'new-payment kill-switch control remains explicit');
assert.match(html,/الطلبات القائمة تواصل مسارها الذي بدأت به/,'in-flight orders are explained as unchanged');

assert.match(sql,/payment_mode text not null default 'manual'/,'database mode defaults to manual');
assert.match(sql,/private\.require_admin_session_v147\(p_session_token\)/,'mode mutations require an admin session on the server');
assert.match(sql,/kinto_payment_settings_audit_g16/,'configuration changes have an audit record');
assert.match(sql,/p_gateway_environment='live'[\s\S]*GATEWAY_INTEGRATION_NOT_DEPLOYED/,'live environment is blocked until integration review');
assert.match(sql,/if p_enabled then[\s\S]*GATEWAY_INTEGRATION_NOT_DEPLOYED/,'collection cannot be enabled before gateway integration');
assert.match(sql,/'effective_payment_mode'\s*,\s*'manual'/,'effective checkout remains manual until separately integrated');
assert.match(sql,/revoke all on function public\.kinto_payment_mode_admin_g16/i,'function privileges are explicitly restricted');

assert.match(ui,/kinto_payment_mode_admin_g16/,'admin UI uses the session-protected RPC');
assert.match(ui,/secure\('request'/,'manual destination changes retain OTP challenge');
assert.match(ui,/secure\('verify'/,'manual destination changes retain OTP verification');
assert.doesNotMatch(ui,/sb\.from\('orders'\)/,'payment-method module does not directly mutate orders');
assert.match(ui,/المسار الفعلي حالياً/,'UI distinguishes selected mode from effective checkout mode');

console.log('PASS: G16 payment-mode and OTP safety contract (static; no database integration claim)');
