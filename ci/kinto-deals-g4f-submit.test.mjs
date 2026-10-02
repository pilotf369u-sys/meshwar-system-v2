import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261002_kinto_deals_v1_g4f_vendor_submit_off.sql',import.meta.url),'utf8');
test('verified vendor submits only a fresh draft exactly once',()=>{
 for(const s of ['private.require_vendor_session(p_session_token)','store_id=v_store for update',"v_c.status<>'draft'",'v_c.updated_at is distinct from p_expected_updated_at','review_state,revision',"'pending',1","status='submitted'","'published',false","'customer_broadcast_sent',false"])assert.ok(sql.includes(s),s);
 assert.doesNotMatch(sql,/update public\.orders|insert into public\.orders|update public\.local_products|admin_send_customer_notice|create trigger/i);
});
