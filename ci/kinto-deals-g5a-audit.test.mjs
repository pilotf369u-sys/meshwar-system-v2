import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const d=readFileSync(new URL('../docs/KINTO_DEALS_G5A_CANONICAL_CHECKOUT_AUDIT.md',import.meta.url),'utf8');
const q=readFileSync(new URL('../docs/KINTO_DEALS_G5A_PREFLIGHT_READONLY.sql',import.meta.url),'utf8');
test('G5A audits active legacy checkout and preserves #716 without modifications',()=>{
 for(const x of ['v101','V97','V411','#716','customer','exactly once','flag OFF','concurrency'])assert.ok(d.toLowerCase().includes(x.toLowerCase()),x);
 for(const x of ['pg_get_functiondef','pg_get_triggerdef','kinto_deals_v1_flags','kinto_deals_v1_redemptions'])assert.ok(q.includes(x),x);
 assert.doesNotMatch(q,/\b(create|alter|drop|insert|update|delete|truncate)\s+(table|trigger|function|into|public\.)/i);
});
