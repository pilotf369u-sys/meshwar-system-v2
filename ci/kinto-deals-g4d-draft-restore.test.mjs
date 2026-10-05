import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261002_kinto_deals_v1_g4d_vendor_draft_restore_off.sql',import.meta.url),'utf8');
test('read-only draft retrieval uses verified store and hides previously submitted drafts',()=>{
 for(const x of ['private.require_vendor_session(p_session_token)','c.store_id=v_store', "c.status='draft'",'not exists(select 1 from public.kinto_deals_v1_submissions','p_campaign_id is null or c.id=p_campaign_id','cp.campaign_id=c.id'])assert.ok(sql.includes(x),x);
 assert.doesNotMatch(sql,/\b(insert into|update|delete from|create trigger)\b/i);
 assert.match(sql,/security definer/);
 assert.match(sql,/revoke all on function/);
});
