import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../js/customer-favorites-v147.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/customer-favorites-v147.css', import.meta.url), 'utf8');
const store = readFileSync(new URL('../store.html', import.meta.url), 'utf8');

assert.match(js, /customer_favorites_get_v146/);
assert.match(js, /customer_favorite_toggle_v146/);
assert.match(js, /customer_favorite_list_create_v146/);
assert.match(js, /customer_favorite_list_rename_v146/);
assert.match(js, /customer_favorite_list_delete_v146/);
assert.match(js, /customer_favorite_move_v146/);
assert.match(js, /kinto_customer_review_session_v132/);
assert.match(js, /kinto_storefront_favorites_v144_/);
assert.doesNotMatch(js, /\.from\(['"](?:orders|local_products|customers|product_reviews|invoices)['"]\)\.(?:insert|update|delete)/);
assert.match(css, /repeat\(2,minmax\(0,1fr\)\)/);
assert.match(store, /customer-favorites-v147\.css/);
assert.match(store, /customer-favorites-v147\.js/);
console.log('Customer favorites V147 UI contract: OK');
