import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261001_v428_customer_notice_atomic_media_attach.sql',import.meta.url),'utf8');
const edge=readFileSync(new URL('../supabase/functions/customer-notice-media-v427/index.ts',import.meta.url),'utf8');
const del=readFileSync(new URL('../supabase/migrations/20261001_v425_customer_notice_media_delete_gate.sql',import.meta.url),'utf8');
const admin=readFileSync(new URL('../js/admin-customer-notices-v415.js',import.meta.url),'utf8');
const customer=readFileSync(new URL('../js/customer-admin-notices-v416.js',import.meta.url),'utf8');
test('attachment and deletion share transaction lock',()=>{
 const lock='pg_advisory_xact_lock(hashtextextended(p_notice_id::text,425))';
 assert.ok(sql.includes(lock));
 assert.ok(del.includes(lock));
 assert.match(sql,/media_delete_pending_at is null for update/);
 assert.match(sql,/owner_id is distinct from p_admin_id/);
 assert.match(sql,/grant execute on function public.attach_customer_notice_media_v428\(uuid,text,text,text,integer\) to service_role/);
 assert.match(sql,/revoke all on function public.attach_customer_notice_media_v428\(uuid,text,text,text,integer\) from public,anon,authenticated/);
});
test('edge uploads object then atomically attaches and cleans failed attachment',()=>{
 assert.match(edge,/admin_session_identity_v147/);
 assert.match(edge,/customer_session_identity_v150/);
 assert.match(edge,/attach_customer_notice_media_v428/);
 assert.ok(edge.indexOf('.upload(path,b,')<edge.indexOf("'attach_customer_notice_media_v428'"));
 assert.match(edge,/insertError\|\|attached!==true/);
 assert.match(edge,/\.remove\(\[path\]\)/);
 assert.match(edge,/createSignedUrl\(asset.object_path,60\)/);
 assert.match(edge,/recipientError\|\|!recipient/);
});
test('admin and customer both wire media endpoints',()=>{
 assert.match(admin,/KintoNoticeMediaPrepareV424.prepare/);
 assert.match(admin,/customer-notice-media-v427/);
 assert.match(admin,/customer-notice-delete-v425/);
 assert.match(customer,/customer-notice-media-v427/);
 assert.match(customer,/details.addEventListener\('toggle'/);
});
