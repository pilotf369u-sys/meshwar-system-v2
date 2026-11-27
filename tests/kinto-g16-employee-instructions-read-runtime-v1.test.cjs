const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../supabase/functions/kinto-g16-employee-instructions-read-v1/index.ts'),'utf8');
function harness(){
 const js=source.replace(/^import .*;\s*/m,'')
 .replace('const modeTypes:Record<string,string>','const modeTypes')
 .replace('function reply(status:number,payload:unknown,origin:string)','function reply(status,payload,origin)')
 .replace('const headers:Record<string,string>','const headers')
 .replace('function clean(v:unknown,max:number)','function clean(v,max)')
 .replace('let body:Record<string,unknown>;','let body;')
 .replace('const value:unknown','const value')
 .replace('body=value as Record<string,unknown>;','body=value;');
 let handler,enabled=false,role='employee',status='تمت الموافقة - بانتظار الدفع',
 paymentType='paid_prepaid',cardEnabled=true,queries=[];
 const origin='https://shopkinto.com',id='11111111-2222-3333-4444-555555555555';
 class MockResponse{constructor(body,init){this.body=body;this.status=init.status}}
 const deno={env:{get(name){return({
  KINTO_G16_INSTRUCTIONS_APPROVED:enabled?'true':'false',
  KINTO_G16_INSTRUCTIONS_ALLOWED_ORIGINS:origin,
  SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_ROLE_KEY:'mock'
 })[name]}},serve(fn){handler=fn}};
 const sb={rpc:async()=>({data:{ok:true,employee:{role}},error:null}),
  from(table){queries.push(table);return{select(){return this},eq(){return this},
   async maybeSingle(){
    return{data:table==='orders'?{id,order_code:'KN-000160',status,
     customer_id:'99999999-2222-3333-4444-555555555555',currency:'IQD',
     delivery_payment_type:paymentType}:
     {id,method_type:'manual',is_enabled:cardEnabled,destination_verified_at:'2026-11-27T10:00:00Z',
      label:'بطاقة KINTO',provider:'مصرف',recipient_name:'المستفيد',account_reference:'ACCOUNT-123'},error:null};
   }}}
 };
 new Function('Deno','createClient','Response',js)(deno,()=>sb,MockResponse);
 const call=async({at=origin,mode='card_full',card_id=id}={})=>handler({
  method:'POST',headers:{get:k=>k==='origin'?at:null},
  text:async()=>JSON.stringify({action:'prepare_manual_instructions',
   session_token:'x'.repeat(40),order_id:id,mode,card_id:mode==='full_cod'?null:card_id})
 });
 return {call,enable(){enabled=true},role:x=>{role=x},status:x=>{status=x},
  paymentType:x=>{paymentType=x},cardEnabled:x=>{cardEnabled=x},queries:()=>queries};
}
test('denied by default with no database reads',async()=>{
 const h=harness();assert.equal((await h.call()).status,503);
 assert.equal(h.queries().length,0);
});
test('verified employee gets real approved card instructions with NO numeric invoice amount',async()=>{
 const h=harness();h.enable();const r=await h.call(),payload=JSON.parse(r.body);
 assert.equal(r.status,200);assert.match(payload.message,/ACCOUNT-123/);
 assert.match(payload.message,/KN-000160/);assert.equal(payload.amountIncluded,false);
 assert.equal(payload.paymentConfirmed,false);assert.equal(payload.requiresEmployeeSend,true);
 assert.deepEqual(h.queries(),['orders','kinto_payment_methods_g16']);
});
test('no customer routing, no invoice amount guessing and no state mutation',()=>{
 for(const word of ['total_price','reward_discount_amount','kinto_campaign_discount_amount',
  '.insert(','.update(','.delete(','.upsert(','.upload('])
  assert.equal(source.includes(word),false,word);
});
test('disallowed origin and wrong actor role blocked',async()=>{
 const h=harness();h.enable();assert.equal((await h.call({at:'https://evil.invalid'})).status,403);
 h.role('viewer');assert.equal((await h.call()).status,403);
 assert.equal(h.queries().length,0);
});
test('paid order or mismatched payment mode cannot return instructions',async()=>{
 const h=harness();h.enable();h.status('تم التسديد');
 assert.equal((await h.call()).status,409);
 h.status('تمت الموافقة - بانتظار الدفع');h.paymentType('cod_full');
 assert.equal((await h.call()).status,409);
});
test('disabled bank method cannot be exposed',async()=>{
 const h=harness();h.enable();h.cardEnabled(false);
 assert.equal((await h.call()).status,403);
});
test('cash collection has no bank information and requires no bank method query',async()=>{
 const h=harness();h.enable();h.paymentType('cod_full');
 const r=await h.call({mode:'full_cod'}),payload=JSON.parse(r.body);
 assert.equal(r.status,200);assert.doesNotMatch(payload.message,/ACCOUNT-123/);
 assert.deepEqual(h.queries(),['orders']);assert.equal(payload.amountIncluded,false);
});
