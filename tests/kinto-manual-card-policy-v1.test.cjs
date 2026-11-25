const test=require('node:test');
const assert=require('node:assert/strict');
const policy=require('../js/kinto-manual-card-policy-v1.js');
const card=(id,extras={})=>({id,label:'بطاقة '+id,method_type:'manual',is_enabled:true,
 destination_verified_at:'2026-11-24T10:00:00Z',account_reference:'TEST-REF-'+id,...extras});
test('employee can choose only among enabled verified admin cards',()=>{
 const cards=[card('a',{is_default:true}),card('b'),card('off',{is_enabled:false}),card('unverified',{destination_verified_at:null})];
 assert.equal(policy.choose(cards,'card_full').id,'a');
 assert.equal(policy.choose(cards,'card_full','b').id,'b');
 assert.throws(()=>policy.choose(cards,'card_full','off'),/CARD_NOT_APPROVED/);
 assert.throws(()=>policy.choose(cards,'card_full','unverified'),/CARD_NOT_APPROVED/);
 assert.equal(policy.list(cards).length,2);
});
test('both transfer paths expose the chosen approved card',()=>{
 const cards=[card('a')];
 for(const mode of ['card_full','goods_now_shipping_cod']){
  const x=policy.preview(cards,mode,'a');assert.equal(x.requires_card,true);assert.equal(x.card.id,'a');
 }
});
test('full cash on delivery never includes a card',()=>{
 const x=policy.preview([card('a')],'full_cod','a');assert.equal(x.card,null);assert.equal(x.requires_card,false);
});
test('no approved card must block transfer preview safely',()=>{
 assert.throws(()=>policy.choose([card('x',{is_enabled:false})],'card_full'),/NO_APPROVED_TRANSFER_CARD/);
});
test('gateway entries and malformed references are excluded',()=>{
 assert.equal(policy.list([card('a',{method_type:'gateway'}),card('b',{account_reference:' '})]).length,0);
});
test('invalid payment mode rejected without side effects',()=>{
 assert.throws(()=>policy.choose([card('a')],'unknown'),/INVALID_PAYMENT_CHOICE/);
});
