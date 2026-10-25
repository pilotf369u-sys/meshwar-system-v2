// Actual pinned SDK, intercepted fetch only: no production endpoint, key or Storage objects.
const test=require('node:test'),assert=require('node:assert/strict');
const {createClient}=require('@supabase/supabase-js');
const rid='00000000-0000-4000-8000-000000000001',path='reviews/00000000-0000-4000-8000-000000000050/sdk-only.png';
for(const scenario of ['removed','remove-denied','list-bucket-missing'])test('pinned SDK transport '+scenario,async()=>{
 const {processOne}=await import('../../supabase/functions/kinto-privacy-media-v1/worker.mjs');const calls=[];
 const fetch=async(input,init={})=>{const url=new URL(typeof input==='string'?input:input.url);assert.equal(url.origin,'https://fixture.invalid');const body=init.body?JSON.parse(init.body):{};const method=init.method||'GET';calls.push({path:url.pathname,body,method});let data={},status=200;
 if(url.pathname.endsWith('prepare_v1'))data={prepared:1};else if(url.pathname.endsWith('claim_v1'))data={id:rid,lease:rid,kind:'storage',bucket:'product-review-images',path};else if(url.pathname.endsWith('finish_v1'))data={removed:body.p_removed};
 else if(url.pathname==='/storage/v1/object/product-review-images'){assert.equal(method,'DELETE');assert.deepEqual(body.prefixes,[path]);if(scenario==='remove-denied'){status=403;data={statusCode:'403',error:'AccessDenied',message:'SYNTHETIC denied'}}else data=[{name:path}];}
 else if(url.pathname==='/storage/v1/object/list/product-review-images'){assert.equal(method,'POST');assert.equal(body.prefix,'reviews/00000000-0000-4000-8000-000000000050');assert.equal(body.search,'sdk-only.png');if(scenario==='list-bucket-missing'){status=404;data={statusCode:'404',error:'NoSuchBucket',message:'SYNTHETIC missing bucket'}}else data=[];}
 else throw Error('Unexpected SDK endpoint '+url.pathname);
 return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}})};
 const client=createClient('https://fixture.invalid','SYNTHETIC-NOT-A-KEY',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch}});
 const result=await processOne(client,'TEST-ADMIN',rid);assert.equal(result.account_deleted,false);assert.equal(result.state,scenario==='removed'?'removed':'retry');assert.equal(calls.find(x=>x.path.endsWith('finish_v1')).body.p_removed,scenario==='removed');
});

test('pinned SDK chat erasure keeps bigint identifiers as strings',async()=>{const {processChatText}=await import('../../supabase/functions/kinto-privacy-media-v1/worker.mjs');const client=createClient('https://fixture.invalid','SYNTHETIC-NOT-A-KEY',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{assert.equal(new URL(input).pathname,'/rest/v1/rpc/kinto_privacy_chat_erase_text_v1');const body=JSON.parse(init.body);assert.equal(body.p_message_id,'9223372036854775807');assert.equal(body.p_confirm_message_id,body.p_message_id);return new Response(JSON.stringify({erased:true}),{headers:{'Content-Type':'application/json'}})}}});assert.deepEqual(await processChatText(client,'TEST-ADMIN',rid,'9223372036854775807'),{state:'erased',account_deleted:false})});
