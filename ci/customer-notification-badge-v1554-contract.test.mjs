import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../js/customer-product-reviews-v135.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');

assert.match(js, /review-ready-v1554:/);
assert.match(js, /review-moderation-v1554:/);
assert.match(js, /notificationUnreadBadge/);
assert.match(js, /badge\.classList\.toggle\('show', count > 0\)/);
assert.match(js, /markAllNotificationsRead/);
assert.match(html, /v1554-badge-reset/);

console.log('Customer notification badge V155.4 contract: OK');
