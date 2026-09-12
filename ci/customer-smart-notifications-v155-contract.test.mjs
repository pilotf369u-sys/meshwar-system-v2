import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../js/customer-product-reviews-v135.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
const sql = readFileSync(new URL('../supabase/migrations/20260912_v155_customer_smart_notifications.sql', import.meta.url), 'utf8');

assert.match(js, /notificationUnreadBadge/);
assert.match(js, /customer_review_moderation_notices_v155/);
assert.match(js, /customer_notification_read_state_v155/);
assert.match(js, /customer_mark_notifications_read_v155/);
assert.match(js, /رأيك يصنع فرقاً/);
assert.match(js, /شكراً لمساهمتك/);
assert.match(html, /v155-smart-notifications/);
assert.match(sql, /customer_notification_reads_v155/);
assert.match(sql, /moderation_status in \('published', 'rejected'\)/);
assert.match(sql, /شكراً لك! تم نشر تقييمك بنجاح/);
assert.match(sql, /offset 500/);
assert.doesNotMatch(sql, /(update|insert into|delete from) public\.(orders|customers|local_products|invoices|order_store_segments)/i);

console.log('Customer smart notifications V155 contract: OK');
