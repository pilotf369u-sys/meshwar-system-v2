import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261002_kinto_deals_v1_g4h_draft_product_hydration_off.sql',import.meta.url),'utf8');
test('G4H exact product hydration is vendor-scoped and read-only',()=>{
 for(const x of ['private.require_vendor_session(p_session_token)','c.store_id=v_store',"c.status='draft'","p.store_id=c.store_id",'as products','as gift_product',"read_only',true"])assert.ok(sql.includes(x),x);
 assert.doesNotMatch(sql,/\b(insert into|update public\.|delete from|create trigger)\b/i);
});
