import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261001_v425_customer_notice_media_delete_gate.sql',import.meta.url),'utf8');
const feed=readFileSync(new URL('../supabase/migrations/20261001_v426_customer_notice_pending_visibility.sql',import.meta.url),'utf8');
const edge=readFileSync(new URL('../supabase/functions/customer-notice-delete-v425/index.ts',import.meta.url),'utf8');
const admin=readFileSync(new URL('../js/admin-customer-notices-v415.js',import.meta.url),'utf8');
test('delete requires verified admin session and service role finalizer',()=>{
 assert.match(sql,/private\.require_admin_session_v147\(p_session_token\)/);
 assert.match(sql,/revoke all on function public\.finalize_customer_notice_delete_v425\(uuid\) from public,anon,authenticated/);
 assert.match(sql,/grant execute on function public\.finalize_customer_notice_delete_v425\(uuid\) to service_role/);
 assert.match(sql,/media_delete_pending_at/);
});
test('pending deletion is hidden from customer feed and cannot be marked read',()=>{
 assert.equal((feed.match(/media_delete_pending_at is null/g)||[]).length,4);
});
test('edge function removes storage before database finalization and validates actor',()=>{
 assert.match(edge,/admin_session_identity_v147/);
 assert.ok(edge.indexOf('.remove([asset.object_path])')<edge.indexOf("'finalize_customer_notice_delete_v425'"));
 assert.match(edge,/DELETE_PENDING_RETRY/);
 assert.match(admin,/functions\.invoke\('customer-notice-delete-v425'/);
});
