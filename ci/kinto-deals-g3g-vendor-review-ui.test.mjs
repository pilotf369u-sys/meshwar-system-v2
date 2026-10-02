import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../vendor-dashboard-v2.html',import.meta.url),'utf8');
const ui=readFileSync(new URL('../js/vendor-kinto-deals-g3g.js',import.meta.url),'utf8');
test('vendor tab uses existing navigation',()=>{
 for(const x of ['vendorTabBtn-deals','vendorTab-deals','vendor-kinto-deals-g3g.js',"'notifications','deals'"])assert.ok(html.includes(x),x);
});
test('verified merchant read-only feed and safe text nodes',()=>{
 assert.match(ui,/meshwar_vendor_session_v95/);
 assert.match(ui,/kinto_deals_v1_vendor_review_feed_g3/);
 assert.match(ui,/MeshwarVendorRuntime\?\.sb/);
 assert.doesNotMatch(ui,/\.from\(|innerHTML|checkout|admin_decide|localStorage/);
 assert.match(ui,/textContent='سبب الرفض:/);
});
