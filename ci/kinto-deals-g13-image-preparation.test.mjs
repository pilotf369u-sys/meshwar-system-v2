import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const src=readFileSync(new URL('../js/kinto-deals-merchant-ad-image-g13.js',import.meta.url),'utf8');
test('G13 module remains isolated and imposes WebP compression limits',()=>{
 assert.match(src,/image\/webp/);
 assert.match(src,/maxBytes = 200 \* 1024/);
 assert.match(src,/1200 \/ Math\.max/);
 assert.match(src,/bitmap\.width \* bitmap\.height > 16000000/);
 assert.doesNotMatch(src,/supabase|fetch\(|checkout|localStorage|storage\.from/);
});
test('G13 prepares a WebP file with a bounded size',async()=>{
 let calls=0;
 const context={window:{},File:class{constructor(chunks,name,opts){this.size=chunks[0].size;this.name=name;this.type=opts.type}},createImageBitmap:async()=>({width:2400,height:1200,close(){}}),document:{createElement:()=>({width:0,height:0,getContext(){return {fillRect(){},drawImage(){},set fillStyle(v){}}},toBlob(cb,type){calls++;cb({size:calls<2?250000:180000,type})}})}};
 vm.runInNewContext(src,context);
 const result=await context.window.KintoMerchantAdImageG13.prepare({type:'image/png',size:1000});
 assert.equal(result.type,'image/webp');assert.ok(result.size<=204800);assert.ok(calls>=2);
});
