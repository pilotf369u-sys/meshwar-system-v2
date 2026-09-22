import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260922_v149_courier_verified_sessions.sql',import.meta.url),'utf8');
const rollback=fs.readFileSync(new URL('../supabase/read-only/20260922_v149_courier_verified_sessions_rollback.sql',import.meta.url),'utf8');
const login=fs.readFileSync(new URL('../login.html',import.meta.url),'utf8');
const dashboard=fs.readFileSync(new URL('../delivery-dashboard.html',import.meta.url),'utf8');
const shell=fs.readFileSync(new URL('../external-shipping-shell.html',import.meta.url),'utf8');
const helper=fs.readFileSync(new URL('../js/courier-session-v149.js',import.meta.url),'utf8');

for(const marker of ['courier_sessions_v149','courier_login_attempts_v149','private.require_courier_session_v149','public.courier_login_v149','public.courier_session_identity_v149','public.courier_logout_v149',"digest(p_session_token, 'sha256')","now() + interval '8 hours'",'COURIER_LOGIN_RATE_LIMITED'])assert.ok(migration.includes(marker),`missing courier session contract: ${marker}`);
assert.match(migration,/v_failed_attempts \+ 1 >= 5/i);
assert.match(migration,/retry_after_seconds', 900/i);
for(const table of ['couriers','branches','employees','orders','invoices','messages','customers']){
  assert.doesNotMatch(migration,new RegExp(`alter\\s+table\\s+public\\.${table}\\b`,'i'));
  assert.doesNotMatch(migration,new RegExp(`(drop|truncate)\\s+table\\s+public\\.${table}\\b`,'i'));
  assert.doesNotMatch(migration,new RegExp(`(update|delete\\s+from)\\s+public\\.${table}\\b`,'i'));
}
for(const marker of ['drop function if exists public.courier_logout_v149(text)','drop function if exists public.courier_session_identity_v149(text)','drop function if exists public.courier_login_v149(text, text)','drop function if exists private.require_courier_session_v149(text)','drop table if exists public.courier_login_attempts_v149','drop table if exists public.courier_sessions_v149'])assert.ok(rollback.includes(marker),`missing rollback contract: ${marker}`);

assert.match(login,/courier-session-v149\.js/);
assert.match(login,/KintoCourierSessionV149\.login/);
assert.match(helper,/sessionStorage/);
assert.match(helper,/courier_session_identity_v149/);
assert.match(helper,/courier_logout_v149/);
assert.match(dashboard,/KintoCourierSessionV149\.identity/);
assert.match(dashboard,/courierVerifiedLogout/);
assert.match(dashboard,/window\.top\.location\.replace/);
assert.match(dashboard,/<html lang="ar" dir="rtl" class="courier-auth-pending">/);
assert.match(dashboard,/html\.courier-auth-pending body\{visibility:hidden\}/);
assert.match(helper,/classList\.remove\(['"]courier-auth-pending['"]\)/);
assert.match(shell,/dataset\.courierAuthPending=['"]true['"]/,'delivery shell must hide before courier verification');
assert.match(shell,/html\[data-courier-auth-pending="true"\] #app\{visibility:hidden\}/,'delivery shell iframe must not flash protected content');
assert.match(dashboard,/removeAttribute\(['"]data-courier-auth-pending['"]\)/,'verified courier identity must reveal the shell');
const verifier=dashboard.slice(dashboard.indexOf('async function verifyCourier()'),dashboard.indexOf('async function enrichCustomers('));
assert.ok(verifier,'courier verifier must exist');
assert.doesNotMatch(verifier,/\.from\(['"]couriers['"]\)/,'courier identity must come from the verified token');
for(const source of [login,helper])assert.doesNotMatch(source,/\.from\(['"]orders['"]\)\.(insert|update|delete)/,'V149 session integration must not add order writes');

console.log('courier verified session V149 contract: ok');
