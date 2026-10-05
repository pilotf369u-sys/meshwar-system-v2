import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../vendor-dashboard-v2.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../js/vendor-kinto-deals-g4c-draft.js',import.meta.url),'utf8');
test('merchant draft form is isolated and labeled as draft-only',()=>{
 for(const id of ['kdDraftForm','kdSearch','kdSelected','kdGift','kdStart','kdEnd','kdSave','kdDraftMessage'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/vendor-kinto-deals-g4c-draft\.js/);
 assert.match(html,/حفظ المسودة فقط/);
});
test('verified session, product search and save RPCs remain isolated',()=>{
 for(const s of ['meshwar_vendor_session_v95','kinto_deals_v1_vendor_products_g4','kinto_deals_v1_vendor_save_draft_g20','p_expected_updated_at','p_campaign_id','p_draft'])assert.ok(js.includes(s),s);
 assert.doesNotMatch(js,/\.from\(|innerHTML|admin_decide|submit_campaign|checkout|localStorage/);
 assert.match(js,/state\.busy/);
 assert.match(js,/state\.selected\.has\(p\.id\)/);
});
