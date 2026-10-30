import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const ui=fs.readFileSync('js/kinto-customer-password-v1.js','utf8');
const drawer=fs.readFileSync('js/customer-navigation-drawer-v156.js','utf8');
const dash=fs.readFileSync('dashboard.html','utf8');
test('isolated client syntax',()=>{new Function(ui);assert(!/localStorage|sessionStorage/.test(ui));});
test('account drawer only and no login change',()=>{assert(drawer.includes("addItem(account,{icon:'fa-lock',label:'الأمان وكلمة المرور'"));assert(dash.includes('js/kinto-customer-password-v1.js'));assert(dash.includes('id="kintoPasswordOpen"'));});
test('session token and no secrets in output',()=>{assert(ui.includes('KintoCustomerSessionV150?.read?.()?.token'));assert(ui.includes("customer_change_password_session_v1"));assert(!/console\.(log|warn|error)\(/.test(ui));});

test('password SECURITY DEFINER only searches trusted schemas',()=>{
 const sql=fs.readFileSync('sql/kinto-customer-password-change-proposal-20261030.sql','utf8');
 assert.match(sql,/LANGUAGE plpgsql SECURITY DEFINER\s+--[^\n]*\n--[^\n]*\nSET search_path = pg_catalog, pg_temp/);
 assert.doesNotMatch(sql,/SET search_path\s*=\s*[^\n]*\bpublic\b/);
 for(const name of ['public.customers','private.require_customer_review_session','private.customer_password_change_attempts_v1','extensions.crypt','extensions.gen_salt'])assert(sql.includes(name),name);
});
