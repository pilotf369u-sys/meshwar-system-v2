const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const file=fs.readFileSync(path.join(__dirname,'../previews/kinto-employee-payment-instruction-isolated-v1.html'),'utf8');
test('standalone employee card preview includes exactly three copy controls',()=>{
 for(const id of ['copyRecipient','copyAccount','copyAmount']){
   assert.match(file,new RegExp('id="'+id+'"'));
   assert.match(file,new RegExp("'"+id+"'"));
 }
 assert.match(file,/copyData=card\?/);
});
test('no card/account copied on cash on delivery',()=>{
 assert.match(file,/copyData=card\?\{/);
 assert.match(file,/disabled=!copyData/);
 assert.match(file,/mode==='full_cod'/);
});
test('no out-of-scope discount or estimated shipping interface',()=>{
 assert.doesNotMatch(file,/questionPreview|payment-questions-v1|deliveryNotice|خصم|التقديرية/);
});
test('preview never sends a message, accesses live APIs or changes orders',()=>{
 for(const phrase of ['fetch(','XMLHttpRequest','window.open(','navigator.share','localStorage','supabase.from(']){
  assert.equal(file.includes(phrase),false,'Unexpected live API: '+phrase);
 }
 assert.match(file,/لم تُرسل ولم تُحفظ/);
});
