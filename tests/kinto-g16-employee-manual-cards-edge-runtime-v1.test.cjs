const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../supabase/functions/kinto-g16-employee-manual-cards-read-v1/index.ts'),'utf8');
function boot(){
 const js=source.replace(/^import .*;\s*/m,'')
  .replace('function response(status:number,body:unknown,origin:string)','function response(status,body,origin)')
  .replace('const headers:Record<string,string>','const headers')
  .replace('let payload:Record<string,unknown>;','let payload;')
  .replace('const candidate:unknown','const candidate')
  .replace('payload=candidate as Record<string,unknown>;','payload=candidate;');
 let handler,enabled=false,role='employee',reads=0;
 const origin='https://shopkinto.com';
 class FakeResponse{constructor(body,options){this.body=body;this.status=options.status}}
 const deno={env:{get(k){return ({KINTO_G16_EMPLOYEE_CARDS_READ_APPROVED:enabled?'true':'false',
  KINTO_G16_CARDS_ALLOWED_ORIGINS:origin,SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_ROLE_KEY:'not-real'})[k]}},serve(fn){handler=fn}};
 const row={id:'card-1',method_type:'manual',label:'Validated',provider:'Example bank',
  recipient_name:'Verified',account_reference:'NUMBER',
  destination_verified_at:'2026-11-27T05:00:00Z',is_enabled:true};
 const sb={rpc:async()=>({data:{ok:true,employee:{role}},error:null}),from(table){
  assert.equal(table,'kinto_payment_methods_g16');reads++;
  return {select(){return this},eq(){return this},not(){return this},order(){return this},
   async limit(){return {data:[row],error:null}}};
 }};
 new Function('Deno','createClient','Response',js)(deno,()=>sb,FakeResponse);
 const request=(at=origin)=>({method:'POST',headers:{get(k){return k==='origin'?at:k==='content-length'?'90':null}},
  text:async()=>JSON.stringify({action:'list_verified_manual_cards',session_token:'x'.repeat(40)})});
 return {call:at=>handler(request(at)),enable:()=>{enabled=true},setRole:x=>{role=x},reads:()=>reads};
}
test('new employee catalogue refuses requests while release switch is disabled',async()=>{
 const env=boot();const result=await env.call();
 assert.equal(result.status,503);assert.equal(env.reads(),0);
});
test('cross-origin calls denied before accessing existing G16 rows',async()=>{
 const env=boot();env.enable();assert.equal((await env.call('https://evil.invalid')).status,403);
 assert.equal(env.reads(),0);
});
test('existing verified employee can read current G16 approved bank rows',async()=>{
 const env=boot();env.enable();const result=await env.call();
 assert.equal(result.status,200);assert.equal(JSON.parse(result.body).cards.length,1);
 assert.equal(env.reads(),1);
});
test('valid session without employee role is denied',async()=>{
 const env=boot();env.enable();env.setRole('viewer');
 assert.equal((await env.call()).status,403);assert.equal(env.reads(),0);
});
