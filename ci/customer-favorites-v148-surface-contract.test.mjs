import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dashboard = readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../js/customer-favorites-dashboard-v148.js', import.meta.url), 'utf8');
const nav = readFileSync(new URL('../js/customer-favorites-nav-v148.js', import.meta.url), 'utf8');
for (const page of ['index.html', 'local-stores.html', 'global-stores.html']) {
  const html = readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
  assert.match(html, /customer-favorites-nav-v148\.js/);
  assert.match(html, /customer-favorites-nav-v148\.css/);
}
assert.match(dashboard, /customer-favorites-dashboard-v148\.js/);
assert.match(dashboard, /customer-favorites-dashboard-v148\.css/);
assert.match(ui, /draftButton\.innerHTML='🛒 السلة'/);
assert.match(ui, /id='customerFavorites'/);
assert.match(ui, /customer_favorites_get_v146/);
assert.match(ui, /customer_favorite_move_v146/);
assert.match(nav, /tab=favorites/);
assert.doesNotMatch(ui + nav, /\.from\(['"](?:orders|customers|local_products|product_reviews|invoices)['"]\)\.(?:insert|update|delete)/);
console.log('Customer favorites V148 surfaces contract: OK');
