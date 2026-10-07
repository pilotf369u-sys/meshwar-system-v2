import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const ui=readFileSync('js/admin-kinto-deals-g3f.js','utf8');
const feed=readFileSync('supabase/migrations/20261004_kinto_deals_v1_g10_simple_publication_feed.sql','utf8');
assert.doesNotMatch(ui,/displayControls|publicationArea|تحديث حالة نشر الإعلانات|إيقاف عرض جميع الإعلانات/);
for(const s of ["['all','الكل']","['pending','قيد المراجعة']","['approved','موافق عليها']","['rejected','مرفوضة']","['approved','موافقة']","['rejected','رفض']","publicationControls(parent,d)","'publish'","'unpublish'"])assert.ok(ui.includes(s),s);
assert.match(feed,/pub\.published=true/);assert.match(feed,/latest\.review_state='acknowledged'/);assert.match(feed,/e\.decision='approved'/);assert.match(feed,/c\.ends_at>statement_timestamp\(\)/);assert.doesNotMatch(feed,/merchant_deals_public_display_g7|f\.setting_key='public_display'|merchant_deals_enabled|active_kinto_campaigns_v400/);
console.log('G10 simplified four-tab publication checks passed');
