import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const js=readFileSync(new URL('../js/vendor-kinto-deals-g4c-draft.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../vendor-dashboard-v2.html',import.meta.url),'utf8');
test('G4G submits only explicitly selected saved draft after confirmation',()=>{
 for(const x of ["'kinto_deals_v1_vendor_submit_g4'","p_campaign_id:item.id","p_expected_updated_at:item.updated_at","window.confirm(","state.busy=true","data.review_state!=='pending'","await listDrafts()"])assert.ok(js.includes(x),x);
 assert.ok(html.includes('الإرسال يقفل التعديل ولا يعني الموافقة أو النشر'));
 assert.doesNotMatch(js,/\.from\(|innerHTML|admin_decide|checkout|admin_send_customer_notice/);
});
