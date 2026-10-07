import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../js/customer-product-reviews-v135.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');

assert.match(js, /REVIEW_NOTIFICATION_POLL_MS = 15000/);
assert.match(js, /startLiveReviewNotifications/);
assert.match(js, /visibilitychange/);
assert.match(js, /await loadReadyProducts\(\)/);
assert.match(js, /clearInterval\(reviewNotificationTimer\)/);
assert.match(html, /v1551-live-notifications/);
assert.doesNotMatch(js, /\.from\(['"](?:orders|customers|local_products|invoices)['"]\)\.(?:insert|update|delete)/);

console.log('Customer live notifications V155.1 contract: OK');
