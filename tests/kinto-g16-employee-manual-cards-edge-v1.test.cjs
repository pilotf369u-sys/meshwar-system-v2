const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const edge=fs.readFileSync(path.join(__dirname,'../supabase/functions/kinto-g16-employee-manual-cards-read-v1/index.ts'),'utf8');
test('endpoint is off by default and requires server-only enable flag',()=>{
 assert.match(edge,/KINTO_G16_EMPLOYEE_CARDS_READ_APPROVED/);
 assert.match(edge,/FEATURE_DISABLED/);
 assert.match(edge,/KINTO_G16_CARDS_ALLOWED_ORIGINS/);
 assert.doesNotMatch(edge,/\|\|'https:\/\//);
});
test('staff session and role are verified by existing v143 server function',()=>{
 assert.match(edge,/sb[.]rpc\('employee_session_identity_v143'/);
 assert.match(edge,/EMPLOYEE_DENIED/);
 assert.match(edge,/\['employee','موظف'\]/);
});
test('server reads only verified G16 manual methods and returns no secrets',()=>{
 assert.match(edge,/sb[.]from\('kinto_payment_methods_g16'\)/);
 assert.match(edge,/[.]eq\('method_type','manual'\)/);
 assert.match(edge,/[.]eq\('is_enabled',true\)/);
 assert.match(edge,/[.]not\('destination_verified_at','is',null\)/);
 for(const token of ['card_number','cvv','password','payment_status','order_total']){
  assert.doesNotMatch(edge,new RegExp("'"+token+"'"));
 }
});
test('endpoint cannot touch orders, invoices, statuses, or stock',()=>{
 assert.doesNotMatch(edge,/\b(?:insert|update|upsert|delete|remove|upload)\s*\(/i);
 assert.doesNotMatch(edge,/\b(?:orders|invoices|inventory|stock)\b/i);
 assert.doesNotMatch(edge,/storage[.]from\(/i);
});
