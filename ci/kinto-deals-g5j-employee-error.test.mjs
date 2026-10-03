import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
const html=readFileSync('employee-dashboard.html','utf8');
assert.ok(html.includes('DEALS_PAID_ALLOCATION_EXHAUSTED'));
assert.ok(html.includes('Insufficient stock for product'));
assert.ok(html.includes('نفد المنتج، حظ أوفر في حملات أخرى قريباً'));
assert.ok(html.includes("status==='تم التسديد'"));
assert.ok(html.includes('lock_not_available'));
assert.ok(html.includes("if(error)throw error;await Promise.all([loadPipelineOrders(),refreshPipelineCounts()])"));
console.log('G5J employee payment error mapping PASS');
