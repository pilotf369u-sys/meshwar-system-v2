const test=require('node:test'),assert=require('node:assert/strict');
const {extract}=require('../js/kinto-invoice-readonly-v1.js');
const invoice={orderCode:'KN-000160',version:'approved-v12',currency:'IQD',
 prepaidMinor:1500,goodsMinor:1200,deliveryDueMinor:300};
function approved(raw=invoice){return{trustedInvoiceSource:true,accessApproved:true,invoice:raw}}
test('preserve invoice amounts exactly and freeze output',()=>{
 const copy=extract(approved());
 assert.equal(copy.prepaidMinor,1500);assert.equal(copy.goodsMinor,1200);
 assert.equal(copy.deliveryDueMinor,300);assert.equal(copy.currency,'IQD');
 assert.ok(Object.isFrozen(copy));
});
test('do not recompute prices even if full prepaid differs from goods plus shipping',()=>{
 const copy=extract(approved({...invoice,prepaidMinor:1700,goodsMinor:1200,deliveryDueMinor:300}));
 assert.equal(copy.prepaidMinor,1700);
});
test('reject unverified invoice origin, missing access and missing invoice',()=>{
 assert.throws(()=>extract({...approved(),trustedInvoiceSource:false}),/INVOICE_SOURCE_NOT_VERIFIED/);
 assert.throws(()=>extract({...approved(),accessApproved:false}),/INVOICE_SOURCE_NOT_VERIFIED/);
 assert.throws(()=>extract(approved(null)),/INVOICE_NOT_AVAILABLE/);
});
test('reject missing/negative/string-valued financial fields',()=>{
 for(const patch of [{goodsMinor:null},{prepaidMinor:'1500'},{deliveryDueMinor:-1},{goodsMinor:1.2}])
 assert.throws(()=>extract(approved({...invoice,...patch})),/INVOICE_APPROVED_AMOUNTS_REQUIRED/);
});
test('no guessing currencies, converting exchange rates or inventing version',()=>{
 assert.throws(()=>extract(approved({...invoice,currency:'TRY'})),/INVOICE_CURRENCY_UNSUPPORTED/);
 assert.throws(()=>extract(approved({...invoice,version:''})),/INVOICE_VERSION_REQUIRED/);
 const usd=extract(approved({...invoice,currency:'USD',prepaidMinor:145,goodsMinor:145,deliveryDueMinor:0}));
 assert.equal(usd.prepaidMinor,145);
});
