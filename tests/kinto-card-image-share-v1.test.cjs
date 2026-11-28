const test=require('node:test'),assert=require('node:assert/strict');
const {validate,share}=require('../js/kinto-card-image-share-v1.js');
const file={type:'image/webp',size:47000,name:'kinto-card-demo.webp'};
test('only locally approved compressed WebP card files can be shared',()=>{
 assert.equal(validate(file),file);
 for(const patch of [{type:'image/svg+xml'},{size:204801},{size:2},{name:'evil.png'},{name:'../kinto-card-demo.webp'}])
 assert.throws(()=>validate({...file,...patch}));
});
test('OS share sheet requires OS support and an explicit share function',async()=>{
 await assert.rejects(()=>share(file,{}),/OS_IMAGE_SHARE_UNSUPPORTED/);
 await assert.rejects(()=>share(file,{canShare:()=>false,share:async()=>{}}),/OS_IMAGE_SHARE_UNSUPPORTED/);
});
test('OS handoff does not assert a message/image was actually delivered',async()=>{
 let calls=0;
 const result=await share(file,{canShare:payload=>payload.files[0]===file,share:async payload=>{
   assert.equal(payload.files[0],file);calls++;
 }});
 assert.equal(calls,1);assert.equal(result.openedShareSheet,true);
 assert.equal(result.sentByKinto,false);assert.equal(result.paymentConfirmed,false);
});
