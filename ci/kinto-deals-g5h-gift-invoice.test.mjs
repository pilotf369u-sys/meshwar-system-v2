import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
const s=readFileSync('js/vendor-v94-multistore-orders.js','utf8');
for(const term of ['is_deal_gift===true','gift_original_unit_price_local','gift_discount_local','<s>','مجاناً','خصم هدية 100%','giftUnit','giftTotal'])assert.ok(s.includes(term),term);
assert.ok(s.includes('const rows=data.items.map'),'same canonical invoice items');
assert.ok(s.includes('const quantity=Math.max(1,Number(item.quantity)||1)'));
console.log('G5H vendor gift invoice presentation contract PASS (10 checks)');
