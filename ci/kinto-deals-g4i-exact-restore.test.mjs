import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const js=readFileSync(new URL('../js/vendor-kinto-deals-g4c-draft.js',import.meta.url),'utf8');
test('G4I restores exact G4H server-owned product metadata, not first page',()=>{
 for(const x of ['Array.isArray(item.products)','new Map(item.products.map','ids.filter(id=>!hydrated.has(id))','item.gift_product.id!==item.gift_product_id','state.catalog.set(p.id,p)','state.updatedAt=item.updated_at'])assert.ok(js.includes(x),x);
 const fn=js.slice(js.indexOf('async function restoreDraft(item)'),js.indexOf('const dateValue='));
 assert.doesNotMatch(fn,/p_search:|p_limit:50|\.from\(|innerHTML/);
 assert.match(fn,/تحديث G4H مطلوب/);
});
