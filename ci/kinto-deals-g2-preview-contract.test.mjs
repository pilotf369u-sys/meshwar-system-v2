import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../previews/kinto-deals-g2-wizard.html',import.meta.url),'utf8');
test('G2 preview remains isolated from live vendor and commerce',()=>{
 assert.match(source,/معاينة مستقلة/);
 for(const forbidden of [/supabase\.co/i,/createClient\s*\(/,/checkout_independent_vendor_orders/i,/fetch\s*\(/,/\.rpc\s*\(/,/localStorage\./,/\.insert\s*\(/])assert.doesNotMatch(source,forbidden);
});
test('four wizard stages and accessible name/barcode search for eligible and gift',()=>{
 for(let i=0;i<4;i++)assert.match(source,new RegExp('id="stage'+i+'"'));
 for(const id of ['eligibleSearch','giftSearch','eligibleResults','giftResults','selectedNames','giftName'])assert.ok(source.includes('id="'+id+'"'),id);
 assert.match(source,/p\.barcode\.toLowerCase\(\)\.includes\(search\)/);
 assert.match(source,/p\.name\.toLocaleLowerCase\(\)\.includes\(search\)/);
});
test('all agreed modes and customer limits represented',()=>{
 for(const mode of ['choose','buy','exclusive'])assert.ok(source.includes('value="'+mode+'"'),mode);
 for(const id of ['threshold','allocation','uses','incentive','start','end'])assert.ok(source.includes('id="'+id+'"'),id);
 assert.match(source,/value="1"/);
});
test('media is local preview only and has type and size guard',()=>{
 assert.match(source,/URL\.createObjectURL\(file\)/);
 assert.match(source,/file\.size>5\*1024\*1024/);
 assert.match(source,/image\/gif/);
 assert.match(source,/URL\.revokeObjectURL\(mediaUrl\)/);
});
test('mobile responsive and no false real admin submission',()=>{
 assert.match(source,/@media\(max-width:640px\)/);
 assert.match(source,/لا يوجد إرسال فعلي للإدارة/);
});
