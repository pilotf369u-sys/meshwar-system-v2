import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  'supabase/migrations/20260921_v143_employee_verified_sessions.sql',
  'utf8'
);
const rollback = fs.readFileSync(
  'supabase/read-only/20260921_v143_employee_verified_sessions_rollback.sql',
  'utf8'
);
const repair = fs.readFileSync(
  'supabase/migrations/20260922_v144_employee_session_runtime_repair.sql',
  'utf8'
);

for (const marker of [
  'employee_sessions_v143',
  'employee_login_attempts_v143',
  'private.require_employee_session_v143',
  'public.employee_login_v143',
  'public.employee_session_identity_v143',
  'public.employee_logout_v143',
  "digest(p_session_token, 'sha256')",
  "now() + interval '8 hours'",
  'EMPLOYEE_LOGIN_RATE_LIMITED'
]) {
  assert.ok(migration.includes(marker), `missing session contract: ${marker}`);
}

assert.match(migration, /revoke all on table public\.employee_sessions_v143 from public, anon, authenticated/i);
assert.match(migration, /revoke all on table public\.employee_login_attempts_v143 from public, anon, authenticated/i);
assert.match(migration, /set search_path = public, private, extensions, pg_temp/i);
assert.match(migration, /v_failed_attempts \+ 1 >= 5/i);
assert.match(migration, /retry_after_seconds', 900/i);
assert.doesNotMatch(migration, /alter\s+table\s+public\.(employees|orders|messages|customers)\b/i);
assert.doesNotMatch(migration, /(drop|truncate)\s+table\s+public\.(employees|orders|messages|customers)\b/i);
assert.doesNotMatch(migration, /update\s+public\.(employees|orders|messages|customers)\b/i);
assert.doesNotMatch(migration, /delete\s+from\s+public\.(employees|orders|messages|customers)\b/i);

assert.match(repair, /alter function public\.employee_login_v143\(text, text\)/i);
assert.match(repair, /set search_path = public, private, extensions, pg_temp/i);
assert.match(repair, /now\(\) \+ interval '8 hours'/i);
assert.match(repair, /v_failed_attempts \+ 1 >= 5/i);

for (const marker of [
  'drop function if exists public.employee_logout_v143(text)',
  'drop function if exists public.employee_session_identity_v143(text)',
  'drop function if exists public.employee_login_v143(text, text)',
  'drop function if exists private.require_employee_session_v143(text)',
  'drop table if exists public.employee_login_attempts_v143',
  'drop table if exists public.employee_sessions_v143'
]) {
  assert.ok(rollback.includes(marker), `missing rollback contract: ${marker}`);
}

console.log('Employee verified session V143 additive contract: OK');
