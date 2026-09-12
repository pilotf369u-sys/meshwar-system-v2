import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../store.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../css/store-card-modern-v144.css',import.meta.url),'utf8');
const client=readFileSync(new URL('../js/store-card-modern-v144.js',import.meta.url),'utf8');
assert.match(html,/store-card-modern-v144\.css/);assert.match(html,/store-card-modern-v144\.js/);
assert.match(css,/repeat\(2,minmax\(0,1fr\)\)/);assert.match(css,/kinto-media-backdrop/);assert.match(css,/object-fit:contain/);
assert.match(css,/min-height:218px/);assert.match(css,/text-overflow:ellipsis/);assert.match(css,/margin-top:auto/);
assert.match(client,/kinto_storefront_favorites_v144_/);assert.match(client,/kinto-favorite-btn/);assert.match(client,/MutationObserver/);
assert.match(html,/id="localStoreLogo"/);assert.match(html,/store_name,logo_url/);
for(const source of[css,client]){assert.doesNotMatch(source,/(?:update|insert|delete).*orders/i);assert.doesNotMatch(source,/(?:update|insert|delete).*employees/i);assert.doesNotMatch(source,/(?:update|insert|delete).*invoices/i)}
console.log('Store card modern V144 contract: OK');
