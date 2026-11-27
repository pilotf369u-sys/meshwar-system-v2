const test=require('node:test'),assert=require('node:assert/strict');
const {create,validate,WIDTH,HEIGHT,LIMIT}=require('../js/kinto-g16-destination-card-artwork-v1.js');
const card={id:'11111111-2222-3333-4444-555555555555',method_type:'manual',
 is_enabled:true,destination_verified_at:'2026-11-27T12:00:00Z',
 provider:'مصرف الرافدين',label:'بطاقة تحويل معتمدة',recipient_name:'مستفيد معتمد',
 account_reference:'12345678909876'};
const ctx={
 measureText(x){return{width:x.length*16}},createLinearGradient(){return{addColorStop(){}}},
 fillRect(){},strokeRect(){},fillText(){},set fillStyle(v){},set strokeStyle(v){},
 set lineWidth(v){},set textAlign(v){},set textBaseline(v){},set font(v){},set direction(v){}
};
const good={type:'image/webp',size:45000};
const doc={createElement(name){assert.equal(name,'canvas');return{
 width:0,height:0,getContext:()=>ctx,toBlob:(fn)=>fn(good)}}};
test('approved destination generates a real shareable compressed WebP without upload',async()=>{
 const out=await create(card,{document:doc});assert.equal(out.blob,good);
 assert.match(out.filename,/^kinto-card-[a-z0-9-]+[.]webp$/i);
 assert.equal(out.bankIssued,false);assert.equal(out.uploaded,false);
 assert.equal(out.sent,false);assert.equal(out.paymentConfirmed,false);
 assert.equal(WIDTH,960);assert.equal(HEIGHT,540);assert.equal(LIMIT,204800);
});
test('unverified, disabled or gateway card is rejected',()=>{
 for(const x of [{destination_verified_at:null},{is_enabled:false},{method_type:'gateway'},
 {recipient_name:''},{account_reference:''}])
 assert.throws(()=>validate({...card,...x}));
});
test('do not silently succeed when WebP output is unsupported or oversized',async()=>{
 const invalidDoc={createElement:()=>({getContext:()=>ctx,toBlob:fn=>fn({type:'image/png',size:12000})})};
 await assert.rejects(()=>create(card,{document:invalidDoc}),/CARD_ARTWORK_OUTPUT_UNSUPPORTED/);
 const hugeDoc={createElement:()=>({getContext:()=>ctx,toBlob:fn=>fn({type:'image/webp',size:LIMIT+1})})};
 await assert.rejects(()=>create(card,{document:hugeDoc}),/CARD_ARTWORK_OUTPUT_UNSUPPORTED/);
});
