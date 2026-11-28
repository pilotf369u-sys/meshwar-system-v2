const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../supabase/functions/kinto-g16-employee-order-context-read-v1/index.ts'),'utf8');
function boot(){
 const js=source.replace(/^import .*;\s*/m,'')
  .replace('function output(status:number,data:unknown,origin:string)','function output(status,data,origin)')
  .replace('function validCustomerId(v:unknown)','function validCustomerId(v)')
  .replace('const headers:Record<string,string>','const headers')
  .replace('let body:Record<string,unknown>;','let body;')
  .replace('const value:unknown','const value')
  .replace('body=value as Record<string,unknown>;','body=value;');
 let handler,enabled=false,role='employee',orderStatus='تمت الموافقة - بانتظار الدفع',reads=0,
 customerId='99999999-2222-3333-4444-555555555555';
 const origin='https://shopkinto.com',id='11111111-2222-3333-4444-555555555555';
 class ResponseMock{constructor(body,opts){this.body=body;this.status=opts.status}}
 const deno={env:{get(key){return({KINTO_G16_ORDER_CONTEXT_APPROVED:enabled?'true':'false',
  KINTO_G16_ORDER_CONTEXT_ALLOWED_ORIGINS:origin,SUPABASE_URL:'https://example.invalid',
  SUPABASE_SERVICE_ROLE_KEY:'mock'})[key]}},serve(fn){handler=fn}};
 const sb={rpc:async()=>({data:{ok:true,employee:{role}},error:null}),from(table){
  assert.equal(table,'orders');reads++;
  return {select(fields){assert.doesNotMatch(fields,/total_price|delivery_fee|discount/);return this},
   eq(){return this},async maybeSingle(){return {data:{id,order_code:'KN-000160',
    customer_id:customerId,status:orderStatus,currency:'IQD',
    delivery_payment_type:'cod_full'},error:null}}};
 }};
 new Function('Deno','createClient','Response',js)(deno,()=>sb,ResponseMock);
 const request=(at=origin)=>({method:'POST',headers:{get(k){return k==='origin'?at:null}},
  text:async()=>JSON.stringify({action:'read_approved_order_context',
   session_token:'x'.repeat(40),order_id:id})});
 return {call:at=>handler(request(at)),enable(){enabled=true},setRole:v=>{role=v},
  setStatus:v=>{orderStatus=v},setCustomerId:v=>{customerId=v},reads:()=>reads};
}
test('disabled by default; no DB read',async()=>{
 const r=boot();assert.equal((await r.call()).status,503);assert.equal(r.reads(),0);
});
test('wrong origin denied without querying orders',async()=>{
 const r=boot();r.enable();assert.equal((await r.call('https://evil.invalid')).status,403);
 assert.equal(r.reads(),0);
});
test('approved order and verified staff return ONLY identity, never invoice amounts',async()=>{
 const r=boot();r.enable();const out=await r.call();assert.equal(out.status,200);
 const b=JSON.parse(out.body);assert.equal(b.ok,true);assert.equal(b.canSendInstructions,false);
 assert.equal(b.invoiceAmountAuthorized,false);assert.equal(b.order.code,'KN-000160');
 assert.equal(JSON.stringify(b).includes('total_price'),false);
});
test('wrong role and non-approved order status fail closed',async()=>{
 const r=boot();r.enable();r.setRole('viewer');assert.equal((await r.call()).status,403);
 r.setRole('employee');r.setStatus('تم التسديد');
 assert.equal((await r.call()).status,409);
});

test('legacy TEXT customer ID is accepted while customer context never authorizes transfer',async()=>{
 const r=boot();r.enable();r.setCustomerId('customer_legacy-1024');
 const result=await r.call(),body=JSON.parse(result.body);
 assert.equal(result.status,200);assert.equal(body.order.customer_id,'customer_legacy-1024');
 assert.equal(body.invoiceAmountAuthorized,false);
 assert.equal(body.canSendInstructions,false);
});
test('bad customer identifiers block order-context release',async()=>{
 for(const identifier of ['', '  ', '\\u0000', 'a'.repeat(129), 74, null]){
  const r=boot();r.enable();r.setCustomerId(identifier);
  const result=await r.call();
  assert.equal(result.status,409,JSON.stringify(identifier));
  assert.equal(JSON.parse(result.body).error,'ORDER_NOT_ELIGIBLE');
 }
});
