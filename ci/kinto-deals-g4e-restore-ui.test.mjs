import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../vendor-dashboard-v2.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../js/vendor-kinto-deals-g4c-draft.js',import.meta.url),'utf8');
test('vendor draft restore is explicit and isolated',()=>{
 for(const id of ['kdDraftList','kdRefreshDrafts','kdDraftForm'])assert.ok(html.includes('id="'+id+'"'));
 for(const x of ['kinto_deals_v1_vendor_drafts_g4','restoreDraft(item)','p_campaign_id:null','item.updated_at','item.terms_snapshot','item.gift_selected_options','state.campaignId=item.id'])assert.ok(js.includes(x),x);
 assert.doesNotMatch(js,/\.from\(|innerHTML|admin_decide|checkout|localStorage/);
});
