const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'../sql/kinto-g16-employee-methods-readonly-v1.review.sql'),'utf8');
test('read-only bridge introduces only one new function',()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION public[.]kinto_g16_employee_manual_methods_read_v1/);
 assert.doesNotMatch(sql,/\b(?:CREATE TABLE|ALTER TABLE|DROP TABLE|CREATE TRIGGER|CREATE POLICY|UPDATE public[.]orders|INSERT INTO public[.]orders)\b/i);
 assert.match(sql,/BEGIN;/);assert.match(sql,/COMMIT;/);
});
test('employee session and role checked by existing verified mechanism',()=>{
 assert.match(sql,/employee_session_identity_v143[(]p_employee_session_token[)]/);
 assert.match(sql,/EMPLOYEE_ROLE_REQUIRED/);
 assert.match(sql,/EMPLOYEE_SESSION_REQUIRED/);
});
test('only active and verified manual destinations may be listed',()=>{
 for(const phrase of ["m.method_type='manual'","m.is_enabled IS TRUE","m.destination_verified_at IS NOT NULL","m.recipient_name","m.account_reference"])
 assert.ok(sql.includes(phrase),phrase);
});
test('no anonymous direct table grants, no writes to any existing business data',()=>{
 assert.doesNotMatch(sql,/\b(?:INSERT INTO|UPDATE|DELETE FROM|TRUNCATE)\s+public[.]/i);
 assert.doesNotMatch(sql,/GRANT\s+(?:SELECT|UPDATE|INSERT|DELETE)\s+ON\s+TABLE/i);
 assert.match(sql,/REVOKE ALL ON FUNCTION/);
});
