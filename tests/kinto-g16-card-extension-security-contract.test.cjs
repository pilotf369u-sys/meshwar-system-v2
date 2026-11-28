const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const sql=fs.readFileSync(path.join(root,'sql/kinto-g16-card-assets-isolated-v1.review.sql'),'utf8');
const edge=fs.readFileSync(path.join(root,'supabase/functions/kinto-card-images-v1/index.ts'),'utf8');
const rollback=fs.readFileSync(path.join(root,'sql/kinto-g16-card-assets-isolated-v1.rollback.review.sql'),'utf8');
test('unsafe draft migration is disabled, not executable',()=>{
 assert.match(sql,/DO NOT RUN/);
 assert.doesNotMatch(sql,/create\s+table|create\s+or\s+replace\s+function|commit\s*;/i);
});
test('no source code changes existing order/invoice/stock tables',()=>{
 for(const source of [sql,edge,rollback]){
  assert.doesNotMatch(source,/\b(?:update|insert\s+into|delete\s+from|alter\s+table)\s+(?:public\.)?(?:orders|invoices|products|inventory|order_items|payment_attempts)\b/i);
 }
});
test('image endpoint is isolated and still requires server verified sessions',()=>{
 assert.match(edge,/admin_session_identity_v147/);
 assert.match(edge,/kinto_g16_employee_card_catalogue_v1/);
 assert.match(edge,/createSignedUrl\(card\.image_object_key,120\)/);
 assert.match(edge,/OTP_RATE_LIMIT/);
});
test('no deployment nor migration from test-only artifacts',()=>{
 assert.doesNotMatch(edge,/\b(update|insert)\s+public\.orders\b/i);
 assert.match(rollback,/kinto_g16_card_assets_v1/);
});
