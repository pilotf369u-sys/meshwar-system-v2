import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../js/customer-product-reviews-v135.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');

assert.match(js, /markAllNotificationsRead/);
assert.match(js, /تعليم الكل كمقروء/);
assert.match(js, /addEventListener\('click', markVisibleNotificationsRead\)/);
assert.match(js, /data-tab="notifications"[\s\S]{0,250}markVisibleNotificationsRead/);
assert.match(html, /إشعاراتك/);
assert.match(html, /تحديث تلقائي/);
assert.doesNotMatch(html, /Supabase Live/);
assert.match(html, /v1552-explicit-read/);

console.log('Customer notification read-on-open UX contract: OK');
