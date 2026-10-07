import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const html=readFileSync('admin-dashboard.html','utf8'),js=readFileSync('js/admin-kinto-deals-g3f.js','utf8');
const start=html.indexOf('<!-- Embedded admin-kinto-deals-g3f.js'),open=html.indexOf('<script>',start),end=html.indexOf('</script>',open);
assert.ok(start>=0&&open>start&&end>open,'embedded campaign script');
const embedded=html.slice(open+'<script>'.length,end).trim();
assert.equal(embedded,js.trim(),'embedded and standalone scripts must match');
for(const x of ['publicationControls(parent,d)','displayControls(publicationArea)','kinto_deals_v1_admin_publication_status_g9'])assert.ok(embedded.includes(x),x);
console.log('G9 admin embedded script parity passed');
