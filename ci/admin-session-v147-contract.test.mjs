import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260922_v147_admin_verified_sessions.sql',import.meta.url),'utf8');
const rollback=fs.readFileSync(new URL('../supabase/read-only/20260922_v147_admin_verified_sessions_rollback.sql',import.meta.url),'utf8');
const login=fs.readFileSync(new URL('../login.html',import.meta.url),'utf8');
const dashboard=fs.readFileSync(new URL('../admin-dashboard.html',import.meta.url),'utf8');
const helper=fs.readFileSync(new URL('../js/admin-session-v147.js',import.meta.url),'utf8');

for(const marker of ['admin_sessions_v147','admin_login_attempts_v147','private.require_admin_session_v147','public.admin_login_v147','public.admin_session_identity_v147','public.admin_logout_v147',"digest(p_session_token, 'sha256')","now() + interval '8 hours'",'ADMIN_LOGIN_RATE_LIMITED'])assert.ok(migration.includes(marker),`missing admin session contract: ${marker}`);
assert.match(migration,/v_failed_attempts \+ 1 >= 5/i);
assert.match(migration,/retry_after_seconds', 900/i);
assert.doesNotMatch(migration,/alter\s+table\s+public\.(employees|orders|messages|customers)\b/i);
assert.doesNotMatch(migration,/(drop|truncate)\s+table\s+public\.(employees|orders|messages|customers)\b/i);
assert.doesNotMatch(migration,/(update|delete\s+from)\s+public\.(employees|orders|messages|customers)\b/i);

for(const marker of ['drop function if exists public.admin_logout_v147(text)','drop function if exists public.admin_session_identity_v147(text)','drop function if exists public.admin_login_v147(text, text)','drop function if exists private.require_admin_session_v147(text)','drop table if exists public.admin_login_attempts_v147','drop table if exists public.admin_sessions_v147'])assert.ok(rollback.includes(marker),`missing rollback contract: ${marker}`);

assert.match(login,/admin-session-v147\.js/);
assert.match(login,/KintoAdminSessionV147\.login/);
assert.match(helper,/sessionStorage/);
assert.match(helper,/admin_session_identity_v147/);
assert.match(helper,/admin_logout_v147/);
assert.match(dashboard,/KintoAdminSessionV147\.identity/);
assert.match(dashboard,/adminVerifiedLogout/);
assert.match(dashboard,/window\.top\.location\.replace/);
const adminVerifier=dashboard.slice(dashboard.indexOf('async function verifyAdminAccess()'),dashboard.indexOf('async function checkAdminRole()'));
assert.ok(adminVerifier,'admin verifier must exist');
assert.doesNotMatch(adminVerifier,/\.from\(['"]employees['"]\)/);

for(const source of [login,helper]){
  assert.doesNotMatch(source,/\.from\(['"]orders['"]\)\.(insert|update|delete)/,'V147 session integration must not add order writes');
}

console.log('admin verified session V147 contract: ok');
