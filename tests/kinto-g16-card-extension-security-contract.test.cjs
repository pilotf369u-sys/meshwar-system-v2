const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const sql=fs.readFileSync(path.join(root,'sql/kinto-g16-card-assets-isolated-v1.review.sql'),'utf8');
const edge=fs.readFileSync(path.join(root,'supabase/functions/kinto-card-images-v1/index.ts'),'utf8');
const rollback=fs.readFileSync(path.join(root,'sql/kinto-g16-card-assets-isolated-v1.rollback.review.sql'),'utf8');
test('G16 card assets are a new isolated extension, no existing commerce table writes',()=>{
 for(const source of [sql,edge,rollback]){
  assert.doesNotMatch(source,/\b(?:update|insert\s+into|delete\s+from|alter\s+table)\s+(?:public\.)?(?:orders|invoices|products|inventory|order_items|payment_attempts)\b/i);
 }
 assert.match(sql,/create table if not exists public\.kinto_g16_card_assets_v1/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on public\.kinto_g16_card_assets_v1 from public, anon, authenticated/);
});
test('all bank image metadata changes require single-use OTP',()=>{
 assert.doesNotMatch(sql,/function public\.kinto_g16_card_asset_apply_v1/);
 assert.match(sql,/function public\.kinto_g16_card_asset_commit_v1/);
 assert.match(sql,/consumed_at is not null/);
 assert.match(sql,/v_ch\.code_hash<>p_otp_hash/);
 assert.match(sql,/for update/);
 assert.match(sql,/consumed_at=now\(\)/);
});
test('private image bucket and no direct public storage read grant',()=>{
 assert.match(sql,/kinto-g16-card-images-v1/);
 assert.match(sql,/false,204800,array\['image\/webp'\]/);
 assert.doesNotMatch(sql,/grant\s+select\s+on\s+storage\.objects\s+to\s+(?:public|anon|authenticated)/i);
 assert.match(edge,/createSignedUrl\(card\.image_object_key,120\)/);
});
test('employee read requires valid session and eligible G16 manual card',()=>{
 assert.match(sql,/employee_session_identity_v143\(p_employee_session_token\)/);
 assert.match(sql,/m\.method_type='manual' and m\.is_enabled=true and m\.destination_verified_at is not null/);
 assert.match(edge,/kinto_g16_employee_card_catalogue_v1/);
});
test('admin image OTP is rate-limited, short lived, and bound to card',()=>{
 assert.match(edge,/OTP_RATE_LIMIT/);
 assert.match(edge,/Date\.now\(\)\+10\*60\*1000/);
 assert.match(sql,/v_ch\.method_id<>p_method_id/);
 assert.match(sql,/v_ch\.admin_id<>v_admin/);
});
