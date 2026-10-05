import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const s=readFileSync(new URL('../supabase/migrations/20261002_kinto_deals_v1_g4j_rejected_revision_clone_off.sql',import.meta.url),'utf8');
test('rejected revision preserves review audit and clones only own campaign into draft',()=>{
 for(const x of ['private.require_vendor_session(p_session_token)','store_id=v_store for update',"v_old.status<>'rejected'","v_last.review_state<>'rejected'","e.decision='rejected'","'revision_origin_campaign_id'","'revision_origin_submission_id'","'draft'","'published',false"])assert.ok(s.includes(x),x);
 assert.doesNotMatch(s,/delete from|update public\.kinto_deals_v1_submissions|update public\.orders|update public\.local_products|admin_send_customer_notice|create trigger/i);
});
