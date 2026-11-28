const test=require('node:test'),assert=require('node:assert/strict');
const {snapshot,verify,recheck}=require('../js/kinto-g16-instruction-freshness-v1.js');
const invoice={orderCode:'KN-000160',version:'approved-r17',currency:'IQD',prepaidMinor:1500,
 goodsMinor:1200,deliveryDueMinor:300,serverVerified:true,orderEligible:true};
const card={id:'card-a',label:'حساب معتمد',recipient_name:'KINTO',account_reference:'REF-A',
 image_object_key:null,method_type:'manual',is_enabled:true,destination_verified_at:'2026-11-27T05:00:00Z'};
const check=(mode='card_full',changes={})=>{
 const old=snapshot(invoice,mode==='full_cod'?null:card,mode);
 return recheck({originalSnapshot:old,fetchCurrentApprovedInvoice:async()=>({...invoice,...changes}),
 fetchVerifiedCards:async()=>[card]});
};
test('unchanged official invoice and verified bank details allow COPY only, never send or payment confirmation',async()=>{
 const r=await check();
 assert.equal(r.fresh,true);assert.equal(r.automaticDispatch,false);
 assert.equal(r.paymentConfirmed,false);assert.equal(r.invoiceChanged,false);
});
test('changed invoice revision, amount, shipping or currency blocks',async()=>{
 for(const change of [{version:'r18'},{prepaidMinor:2000},{deliveryDueMinor:400},
  {currency:'USD'},{orderEligible:false},{serverVerified:false}]){
  await assert.rejects(()=>check('card_full',change));
 }
});
test('changed bank recipient, reference, image key or label blocks even with same id',async()=>{
 for(const change of [{recipient_name:'OTHER'},{account_reference:'REF-B'},
  {image_object_key:'new.webp'},{label:'NEW'}]){
  const old=snapshot(invoice,card,'card_full');
  await assert.rejects(()=>recheck({originalSnapshot:old,fetchCurrentApprovedInvoice:async()=>invoice,
   fetchVerifiedCards:async()=>[{...card,...change}]}),/STALE_APPROVED_CARD/);
 }
});
test('disabled or missing verified bank destination blocks',async()=>{
 const old=snapshot(invoice,card,'card_full');
 for(const list of [[],[{...card,is_enabled:false}],[{...card,destination_verified_at:null}]]){
  await assert.rejects(()=>recheck({originalSnapshot:old,fetchCurrentApprovedInvoice:async()=>invoice,
   fetchVerifiedCards:async()=>list}),/CURRENT_VERIFIED_CARD_REQUIRED/);
 }
});
test('cash at door has no bank card and does not transfer money',async()=>{
 const r=await check('full_cod');assert.equal(r.paymentConfirmed,false);
 const old=snapshot(invoice,null,'full_cod');assert.equal(old.amountMinor,0);
 assert.equal(old.card,null);
});
test('goods now and delivery at door preserve approved split without recalculating',async()=>{
 const old=snapshot(invoice,card,'goods_now_shipping_cod');
 assert.equal(old.amountMinor,1200);assert.equal(old.deliveryDueMinor,300);
 const r=await check('goods_now_shipping_cod');assert.equal(r.fresh,true);
});
test('missing server readers never produces a sendable message',async()=>{
 await assert.rejects(()=>recheck({originalSnapshot:snapshot(invoice,card,'card_full')}),
 /TRUSTED_SERVER_READERS_REQUIRED/);
});
