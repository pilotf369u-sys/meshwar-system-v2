import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const js=readFileSync('js/admin-kinto-deals-g3f.js','utf8'),html=readFileSync('admin-dashboard.html','utf8');
const predicate="detailCard(entry,d,!(reviewFilter==='pending'||item.review_state==='pending'||d.review_state==='pending'))";
test('pending inbox offers review actions in standalone and embedded admin',()=>{for(const source of [js,html]){assert.ok(source.includes(predicate));assert.match(source,/\['approved','موافقة'\]/);assert.match(source,/\['rejected','رفض'\]/);assert.match(source,/r\.length<3/);assert.match(source,/if\(readOnly\)/);assert.match(source,/publicationControls\(parent,d\)/);assert.doesNotMatch(source,/إيقاف عرض جميع الإعلانات|تحديث حالة نشر الإعلانات/)}});
