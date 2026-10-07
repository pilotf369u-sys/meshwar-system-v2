import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260922_v148_branch_verified_sessions.sql',import.meta.url),'utf8');
const rollback=fs.readFileSync(new URL('../supabase/read-only/20260922_v148_branch_verified_sessions_rollback.sql',import.meta.url),'utf8');
const login=fs.readFileSync(new URL('../login.html',import.meta.url),'utf8');
const dashboard=fs.readFileSync(new URL('../branch-dashboard.html',import.meta.url),'utf8');
const helper=fs.readFileSync(new URL('../js/branch-session-v148.js',import.meta.url),'utf8');

for(const marker of ['branch_sessions_v148','branch_login_attempts_v148','private.require_branch_session_v148','public.branch_login_v148','public.branch_session_identity_v148','public.branch_logout_v148',"digest(p_session_token, 'sha256')","now() + interval '8 hours'",'BRANCH_LOGIN_RATE_LIMITED'])assert.ok(migration.includes(marker),`missing branch session contract: ${marker}`);
assert.match(migration,/v_failed_attempts \+ 1 >= 5/i);
assert.match(migration,/retry_after_seconds', 900/i);
for(const table of ['branches','employees','orders','invoices','messages','customers']){
  assert.doesNotMatch(migration,new RegExp(`alter\\s+table\\s+public\\.${table}\\b`,'i'));
  assert.doesNotMatch(migration,new RegExp(`(drop|truncate)\\s+table\\s+public\\.${table}\\b`,'i'));
  assert.doesNotMatch(migration,new RegExp(`(update|delete\\s+from)\\s+public\\.${table}\\b`,'i'));
}

for(const marker of ['drop function if exists public.branch_logout_v148(text)','drop function if exists public.branch_session_identity_v148(text)','drop function if exists public.branch_login_v148(text, text)','drop function if exists private.require_branch_session_v148(text)','drop table if exists public.branch_login_attempts_v148','drop table if exists public.branch_sessions_v148'])assert.ok(rollback.includes(marker),`missing rollback contract: ${marker}`);

assert.match(login,/branch-session-v148\.js/);
assert.match(login,/KintoBranchSessionV148\.login/);
assert.match(helper,/sessionStorage/);
assert.match(helper,/branch_session_identity_v148/);
assert.match(helper,/branch_logout_v148/);
assert.match(dashboard,/KintoBranchSessionV148\.identity/);
assert.match(dashboard,/branchVerifiedLogout/);
assert.match(dashboard,/window\.top\.location\.replace/);
assert.match(dashboard,/<html lang="ar" dir="rtl" class="branch-auth-pending">/);
assert.match(dashboard,/html\.branch-auth-pending body\{visibility:hidden\}/);
assert.match(helper,/classList\.remove\(['"]branch-auth-pending['"]\)/);
const identityLoader=dashboard.slice(dashboard.indexOf('async function loadIdentity()'),dashboard.indexOf('async function loadCouriers()'));
assert.ok(identityLoader,'branch identity loader must exist');
assert.doesNotMatch(identityLoader,/\.from\(['"]branches['"]\)/,'branch identity must come from the verified token');

for(const source of [login,helper])assert.doesNotMatch(source,/\.from\(['"]orders['"]\)\.(insert|update|delete)/,'V148 session integration must not add order writes');

console.log('branch verified session V148 contract: ok');
