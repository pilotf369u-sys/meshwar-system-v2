import assert from 'node:assert/strict';
import fs from 'node:fs';

const login=fs.readFileSync(new URL('../login.html',import.meta.url),'utf8');
const dashboard=fs.readFileSync(new URL('../employee-dashboard.html',import.meta.url),'utf8');
const helper=fs.readFileSync(new URL('../js/employee-session-v143.js',import.meta.url),'utf8');

assert.match(login,/employee-session-v143\.js/,'login must load the employee session helper');
assert.match(login,/secureAwareLogin/,'login must use the verified employee path');
assert.match(login,/if\(!employee\|\|normalizeRole\(employee\.role\)!==['"]employee['"]\)return login\(\)/,'non-employee accounts must stay on their existing login paths');
assert.match(helper,/employee_login_v143/,'helper must call the verified login RPC');
assert.match(helper,/employee_session_identity_v143/,'helper must resolve identity through the session RPC');
assert.match(helper,/employee_logout_v143/,'helper must revoke the session on logout');
assert.match(helper,/sessionStorage/,'employee session must stay scoped to the browser tab');

assert.match(dashboard,/employee-session-v143\.js/,'dashboard must load the employee session helper');
assert.match(dashboard,/KintoEmployeeSessionV143\.identity/,'dashboard identity must come from the verified token');
assert.doesNotMatch(dashboard,/async function loadEmployeeIdentity\(\).*?\.from\(['"]employees['"]\)/s,'dashboard must not trust employeeId for identity');
assert.match(dashboard,/employeeVerifiedLogout/,'dashboard must use verified logout');
assert.match(dashboard,/window\.top\.location\.replace/,'logout/invalid session must leave the employee shell');
assert.match(dashboard,/تعذر التحقق:[^}]+throw e/,'failed identity must stop later dashboard loaders');

for(const source of [login,helper]){
  assert.doesNotMatch(source,/\.from\(['"]orders['"]\)\.(insert|update|delete)/,'session integration must not change order writes');
  assert.doesNotMatch(source,/\.from\(['"]messages['"]\)\.(insert|update|delete)/,'session integration must not change message writes');
}

console.log('employee session UI V143 contract: ok');
