// Actual shipped invoice identity functions; synthetic data, intercepted directory only.
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('js/kinto-bundle-ui-v93.js','utf8');
const line=prefix=>source.split('\n').find(x=>x.startsWith(prefix));
const first=line('const first='),details=line('function details('),customer=line('function customerData('),hydrate=line('async function hydrateCustomer(');
const retained=source.slice(source.indexOf('async function retainedInvoiceCustomerV1('),source.indexOf('async function hydrateCustomer('));
const helper=source.slice(source.indexOf('function frozenInvoiceCustomerV1('),source.indexOf('function customerData('));
assert(first&&details&&customer&&hydrate&&helper);
const profile={name:'TEST LIVE NAME',customer_code:'TEST-CODE',phone:'TEST-PHONE',secondary_phone:'TEST-SECONDARY',country:'TEST-COUNTRY',province:'TEST-PROVINCE',address:'TEST-ADDRESS'};
const saved={name:'TEST SAVED NAME',code:'TEST-SAVED-CODE',phone:'TEST-SAVED-PHONE',secondary_phone:'',country:'TEST-SAVED-COUNTRY',province:'TEST-SAVED-PROVINCE',address:'TEST-SAVED-ADDRESS'};
const plain=x=>JSON.parse(JSON.stringify(x));
function api(options={}){let calls=0;const reads=[];const directory={session:()=>({role:'admin',token:'TEST-SESSION'}),from(){calls++;return{eq:()=>({maybeSingle:async()=>({data:options.missing?null:profile,error:options.denied?{message:"TEST_DENIED"}:null})})}}};const result=vm.runInNewContext(`${first}\n${details}\n${helper}\n${customer}\n${retained}\n${hydrate}\n({read:customerData,hydrate:hydrateCustomer})`,{KintoCustomerDirectoryV1:directory,window:{KintoCustomerDirectoryV1:directory},SUPABASE_URL:'https://fixture.invalid',SUPABASE_KEY:'TEST-KEY',fetch:async(url,init)=>{reads.push({url,init});return{ok:!options.readDenied,json:async()=>options.identity||saved}},console:{warn(){}}});return{...result,calls:()=>calls,reads}}
test('complete saved invoice identity survives profile removal and later profile edits',async()=>{
 const a=api(),order={customer_id:'TEST-ONLY',total_price:12345,currency:'IQD',status:'TEST paid',details:JSON.stringify({customer:saved}),_kintoCustomer:profile};
 const before=JSON.stringify(order),identity=plain(a.read(order));assert.equal(identity.name,saved.name);assert.equal(identity.secondary,'');
 assert.deepEqual(identity,plain(a.read({...order,_kintoCustomer:null})));
 assert.deepEqual(identity,plain(a.read({...order,_kintoCustomer:{...profile,name:'TEST CHANGED'}})));
 await a.hydrate(order);assert.equal(a.calls(),0);assert.equal(JSON.stringify(order),before);
});
test('complete segment snapshot is used without a customer-directory request',async()=>{
 const a=api(),order={customer_id:'TEST',customer_snapshot:saved,details:'{}'};await a.hydrate(order);
 assert.equal(a.calls(),0);assert.equal(a.read(order).phone,saved.phone);assert.equal(a.read(order).code,saved.code);
});
test('partial snapshot keeps existing legacy hydration rather than mixing frozen and live identity',async()=>{
 const a=api(),order={customer_id:'TEST',customer_snapshot:{name:'PARTIAL'},details:'{}'};await a.hydrate(order);
 assert.equal(a.calls(),1);assert.equal(a.read(order).name,profile.name);assert.equal(a.read(order).phone,profile.phone);
});
test('incomplete details.customer preserves existing populated-profile fallback',async()=>{
 const a=api(),order={customer_id:'TEST',details:JSON.stringify({customer:{name:'PARTIAL'}})};await a.hydrate(order);
 assert.equal(a.calls(),1);assert.equal(a.read(order).name,profile.name);
});
test('legacy orders without snapshots keep all seven existing fields',async()=>{
 const a=api(),order={customer_id:'TEST',details:'{}'};await a.hydrate(order);
 assert.deepEqual(plain(a.read(order)),{name:profile.name,code:profile.customer_code,phone:profile.phone,secondary:profile.secondary_phone,country:profile.country,province:profile.province,address:profile.address});
});
test('missing account plus partial snapshot remains visibly incomplete, never a deletion proof',()=>{
 const a=api(),order={details:'{}',customer_snapshot:{name:'PARTIAL'},_kintoCustomer:null};assert.equal(a.read(order).phone,'');
});
test('malformed details and non-object snapshots do not break legacy identity',()=>{
 const a=api();for(const value of [[],null,'{"name":"not decoded"}',42])assert.equal(a.read({details:'{bad',customer_snapshot:value,_kintoCustomer:profile}).name,profile.name);
});
test('own strings required; inherited fields, non-string fields and missing optional-field presence cannot assert complete',async()=>{
 for(const candidate of [Object.create(saved),{...saved,phone:12345},(()=>{const s={...saved};delete s.secondary_phone;return s})()]){
  const a=api(),order={customer_id:'TEST',customer_snapshot:candidate,details:'{}'};await a.hydrate(order);assert.equal(a.calls(),1);
 }
});

test('null JSON details cannot break cached customer identity',()=>{const a=api();assert.equal(a.read({details:'null',_kintoCustomer:profile}).name,profile.name)});

test('legacy missing profile uses only a session-scoped retained invoice read',async()=>{const a=api({missing:true}),order={id:'TEST-ORDER',customer_id:'TEST',details:'{}'};await a.hydrate(order);assert.equal(a.read(order).name,saved.name);assert.equal(a.reads.length,1);assert.equal(a.reads[0].url,'https://fixture.invalid/rest/v1/rpc/kinto_privacy_invoice_read_v1');assert.equal(a.reads[0].init.method,'POST');assert.deepEqual(JSON.parse(a.reads[0].init.body),{p_role:'admin',p_session_token:'TEST-SESSION',p_order_id:'TEST-ORDER'});assert.equal(a.reads[0].url.includes('TEST-SESSION'),false)});
test('denied customer session never falls back to retained identity',async()=>{const a=api({missing:true,denied:true}),order={id:'TEST-ORDER',customer_id:'TEST',details:'{}'};await a.hydrate(order);assert.equal(a.reads.length,0);assert.equal(a.read(order).name,'')});
test('missing or denied retained resource never invents identity',async()=>{for(const options of [{readDenied:true},{identity:{name:'INCOMPLETE'}}]){const a=api({missing:true,...options}),order={id:'TEST-ORDER',customer_id:'TEST',details:'{}'};await a.hydrate(order);assert.equal(a.read(order).phone,'')}});
