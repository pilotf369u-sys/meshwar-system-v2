import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
test('retired reward API has no shipped browser caller; current session paths remain',()=>{
 const files=[...fs.readdirSync('.').filter(x=>x.endsWith('.html')),...fs.readdirSync('js').filter(x=>x.endsWith('.js')).map(x=>'js/'+x)];
 for(const file of files)assert(!fs.readFileSync(file,'utf8').includes('apply_order_reward_discount'),file);
 assert(fs.readFileSync('js/kinto-points-v310.js','utf8').includes("sb.rpc('customer_apply_coupon_v310'"));
 assert(fs.readFileSync('admin-dashboard.html','utf8').includes('admin_loyalty_overview_v310'));
 assert(fs.readFileSync('sql/kinto-session-verified-sensitive-rpcs-v1.sql','utf8').includes('adjust_customer_reward_balance_admin_session_v1'));
 assert(fs.readFileSync('employee-dashboard.html','utf8').includes('employee_loyalty_overview_v310'));
 assert(fs.readFileSync('sql/kinto-session-verified-sensitive-rpcs-v1.sql','utf8').includes('adjust_customer_reward_balance_employee_session_v1'));
});
test('lockdown changes only the one legacy function ACL and has an explicit rollback',()=>{
 const sql=fs.readFileSync('sql/kinto-legacy-reward-discount-lockdown-v1.sql','utf8');assert(sql.includes('public.apply_order_reward_discount(uuid,numeric,text,text)'));assert(sql.includes('FROM PUBLIC,anon,authenticated'));assert(!/CREATE|DROP|UPDATE|INSERT|DELETE|ALTER TABLE/i.test(sql.replace(/--[^\n]*/g,'')));assert(!/customer_apply_coupon|adjust_customer_reward_balance/.test(sql));
 assert(fs.readFileSync('sql/kinto-legacy-reward-discount-rollback-v1.sql','utf8').includes('TO anon,authenticated'));
});
