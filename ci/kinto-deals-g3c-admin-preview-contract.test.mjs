import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../previews/kinto-deals-g3c-admin-review.html',import.meta.url),'utf8');
test('admin review preview is isolated and has no production calls',()=>{
 for(const x of [/supabase\.co/i,/createClient\s*\(/i,/\.rpc\s*\(/i,/\bfetch\s*\(/i,/admin-dashboard\.html/i])assert.doesNotMatch(html,x);
 assert.match(html,/بيانات تجريبية/);
 assert.match(html,/لا اتصال بـSupabase/);
});
test('admin decisions require confirmation and rejection reason',()=>{
 assert.match(html,/data-action="approve"/);
 assert.match(html,/data-action="reject"/);
 assert.match(html,/\.value\.trim\(\)\.length<3/);
 assert.match(html,/confirm\(/);
 assert.match(html,/viewport/);
});
