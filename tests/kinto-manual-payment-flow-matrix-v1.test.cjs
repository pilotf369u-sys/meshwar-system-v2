const test=require('node:test'),assert=require('node:assert/strict');
const readonly=require('../js/kinto-invoice-readonly-v1.js');
const policy=require('../js/kinto-manual-card-policy-v1.js');
const guard=require('../js/kinto-manual-dispatch-preflight-v1.js');
const messages=require('../js/kinto-manual-payment-message-v1.js');
const snapshot=require('../js/kinto-payment-instruction-snapshot-v1.js');
const handoff=require('../js/kinto-payment-whatsapp-handoff-v1.js');
const invoice=readonly.extract({trustedInvoiceSource:true,accessApproved:true,invoice:{orderCode:'KN-000160',version:'v1',currency:'IQD',prepaidMinor:1500,goodsMinor:1200,deliveryDueMinor:300}});
const verified={id:'card-a',label:'حساب تجريبي',provider:'مصرف تجريبي',recipient_name:'اسم حساب تجريبي',
 account_reference:'TEST-ACCOUNT-001',method_type:'manual',is_enabled:true,
 destination_verified_at:'2026-11-24T10:00:00Z',is_default:true};
function run(mode,channel,cards=[verified],selectedId=null){
 const card=policy.choose(cards,mode,selectedId);
 const pre=guard.preflight({employeeAuthorized:true,invoiceAuthorized:true,orderEligible:true,
 mode,channel,invoice,invoiceVersion:'v1',cardId:card?.id||'',serverCards:cards});
 const message=messages.compose({mode,card,approvedInvoice:invoice});
 assert.equal(message.amountMinor,pre.amountMinor);
 const audit=snapshot.make({employeeAuthorized:true,invoiceAuthorized:true,orderEligible:true,
 requestId:'DEMO-'+mode+'-'+channel,actorId:'staff-demo',orderCode:invoice.orderCode,
 invoiceVersion:invoice.version,mode,channel,amountMinor:pre.amountMinor,currency:invoice.currency,card});
 assert.equal(audit.paymentStatusChanged,false);
 assert.equal(audit.inventoryChanged,false);
 assert.equal(audit.invoiceChanged,false);
 return {card,pre,message,audit};
}
for(const mode of ['card_full','goods_now_shipping_cod','full_cod']){
 for(const channel of ['whatsapp','internal_chat']){
  test('end-to-end isolated preview matrix: '+mode+'/'+channel,()=>{
   const result=run(mode,channel);
   assert.equal(result.pre.mode,mode);assert.equal(result.pre.channel,channel);
   if(mode==='card_full'){assert.equal(result.pre.amountMinor,1500);assert.match(result.message.text,/1,500 IQD/);}
   if(mode==='goods_now_shipping_cod'){assert.equal(result.pre.amountMinor,1200);assert.match(result.message.text,/300 IQD/);}
   if(mode==='full_cod'){assert.equal(result.card,null);assert.equal(result.pre.amountMinor,0);assert.doesNotMatch(result.message.text,/TEST-ACCOUNT/);}
   if(channel==='whatsapp') {
    const link=handoff.build('+9647701234567',result.message.text);
    assert.equal(link.requiresEmployeeSend,true);assert.equal(link.paymentConfirmed,false);
    assert.equal(link.imageAutoAttached,false);
   }
  });
 }
}
test('disabled bank card cannot pass policy or dispatch',()=>{
 const disabled={...verified,is_enabled:false};
 assert.throws(()=>run('card_full','whatsapp',[disabled]),/NO_APPROVED_TRANSFER_CARD/);
});
test('verified name is mandatory, not only account number',()=>{
 assert.throws(()=>run('card_full','whatsapp',[{...verified,recipient_name:''}]),/NO_APPROVED_TRANSFER_CARD/);
});
test('changed bank account with same send ID is a conflict',()=>{
 const prev=run('card_full','whatsapp').audit;
 assert.throws(()=>snapshot.inspect([prev],{
  employeeAuthorized:true,invoiceAuthorized:true,orderEligible:true,requestId:prev.requestId,
  actorId:prev.actorId,orderCode:prev.orderCode,invoiceVersion:prev.invoiceVersion,mode:prev.mode,
  channel:prev.channel,amountMinor:prev.amountMinor,currency:prev.currency,
  card:{...verified,account_reference:'TEST-ACCOUNT-CHANGED'}
 }),/IDEMPOTENCY_CONFLICT/);
});
