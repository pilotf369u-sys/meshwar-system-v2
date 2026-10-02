import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const review=readFileSync(new URL('../js/vendor-kinto-deals-g3g.js',import.meta.url),'utf8');
const draft=readFileSync(new URL('../js/vendor-kinto-deals-g4c-draft.js',import.meta.url),'utf8');
test('rejected merchant action requires confirmation and verified revision RPC',()=>{
 for(const x of ["row.display_state==='rejected'","window.confirm(","'kinto_deals_v1_vendor_revise_rejected_g4'","p_rejected_campaign_id:row.campaign_id","data.status!=='draft'","kinto-deals-revision-created"])assert.ok(review.includes(x),x);
 for(const x of ["window.addEventListener('kinto-deals-revision-created'","p_campaign_id:campaignId","await restoreDraft(data.items[0])"])assert.ok(draft.includes(x),x);
 assert.doesNotMatch(review,/\.from\(|innerHTML|checkout|admin_decide/);
});
