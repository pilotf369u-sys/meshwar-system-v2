import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const js=readFileSync(new URL('../js/customer-notice-media-prepare-v424.js',import.meta.url),'utf8');
const sql=readFileSync(new URL('../supabase/migrations/20261001_v418_customer_notice_media_foundation.sql',import.meta.url),'utf8');
test('notice media client bounds and animation safety',()=>{
 assert.match(js,/MAX_INPUT=12\*1024\*1024/);
 assert.match(js,/MAX_OUTPUT=5\*1024\*1024/);
 assert.match(js,/MAX_EDGE=1440/);
 assert.match(js,/file\.type==='image\/gif'/);
 assert.match(js,/return file;/);
 assert.match(js,/image\/webp/);
 assert.match(js,/signature\(file\.type,b\)/);
});
test('existing media bucket remains private and one-to-one',()=>{
 assert.match(sql,/kinto-customer-notice-media/);
 assert.match(sql,/notice_id uuid primary key/);
 assert.match(sql,/on delete restrict/);
 assert.match(sql,/revoke all on public\.kinto_customer_notice_assets_v418/);
});
