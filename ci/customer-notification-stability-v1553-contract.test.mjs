import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../js/customer-product-reviews-v135.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');

assert.match(js, /loadReadyProducts\(options = \{\}\)/);
assert.match(js, /loadReadyProducts\(\{ silent: true \}\)/);
assert.match(js, /nextSignature !== state\.readySignature/);
assert.match(js, /nextSignature !== state\.moderationSignature/);
assert.match(js, /existing\?\.dataset\.notificationKey === notificationKey/);
assert.match(js, /\[\.\.\.state\.moderationNotices\]\.reverse\(\)\.forEach/);
assert.match(html, /v1553-stable-refresh/);

console.log('Customer notification stability V155.3 contract: OK');
