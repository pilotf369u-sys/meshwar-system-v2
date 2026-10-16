import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const root='https://hsmmbloouskqdnptiiad.supabase.co';
test('three actual upload paths obtain vendor tickets before upload, preserving immutable paths',async()=>{
 for(const kind of ['product','promotion','multi']){
  let session={token:'synthetic-session',expiresAt:'2099-01-01'},fail=false;const requests=[],uploads=[];
  const fetch=async(url,options)=>{if(url.includes('/rpc/')){const body=JSON.parse(options.body);requests.push(body);return {ok:!fail,json:async()=>fail?{message:'DENIED'}:{bucket:'product-images',path:'store-1/server-'+requests.length+'.png',mime_type:'image/png'}}}uploads.push({url,options});return {ok:true}};
  const sb={storage:{from:bucket=>({upload:async(path,file,options)=>{uploads.push({bucket,path,options});return {}},getPublicUrl:path=>({data:{publicUrl:root+'/storage/v1/object/public/product-images/'+path}})})}};
  const context={window:{},sessionStorage:{getItem:()=>JSON.stringify(session)},fetch,Date,sb,PRODUCT_IMAGES_BUCKET:'product-images',BUCKET:'product-images',SB_URL:root,SB_KEY:'public-test-key',vendorStore:kind==='product'?{id:'store-1'}:()=>({id:'store-1'}),getClient:async()=>sb};vm.createContext(context);vm.runInContext(fs.readFileSync('js/kinto-vendor-media-v1.js','utf8'),context);
  let source,fn,args;
  if(kind==='product'){const s=fs.readFileSync('vendor-dashboard-v2.html','utf8');source=s.slice(s.indexOf('async function uploadProductImage('),s.indexOf('function previewSelectedProductImage('));fn='uploadProductImage';args=[{name:'untrusted.svg',type:'image/png',size:123}];}
  if(kind==='promotion'){source=fs.readFileSync('js/vendor-featured-requests-v2.js','utf8').split('\n').find(x=>x.startsWith('async function uploadAsset('));fn='uploadAsset';args=[{name:'banner.png',type:'image/png',size:123},'banner'];}
  if(kind==='multi'){source=fs.readFileSync('js/local-store-product-details-v4-core.js','utf8').split('\n').find(x=>x.includes('async function uploadFile('));fn='uploadFile';args=[{name:'product.png',type:'image/png',size:123},'store-1'];}
  vm.runInContext(source,context);const result=await context[fn](...args);assert(result.endsWith('store-1/server-1.png'));assert.equal(uploads.length,1);assert.equal(requests[0].p_session_token,session.token);assert.equal(requests[0].p_store_id,'store-1');assert.equal(requests[0].p_purpose,kind==='promotion'?'banner':'product');assert.equal(requests[0].p_byte_size,123);
  if(kind==='multi')assert.equal(uploads[0].options.headers['x-upsert'],'false');else assert.equal(uploads[0].options.upsert,false);
  session=null;await assert.rejects(()=>context[fn](...args));assert.equal(requests.length,1);assert.equal(uploads.length,1);
  session={token:'synthetic-session',expiresAt:'2000-01-01'};await assert.rejects(()=>context[fn](...args));assert.equal(requests.length,1);
  session={token:'synthetic-session'};fail=true;await assert.rejects(()=>context[fn](...args),/DENIED/);assert.equal(uploads.length,1);
 }
});
test('vendor host and loader versions load the helper and updated upload modules',()=>{
 const host=fs.readFileSync('vendor-dashboard-v2.html','utf8');assert(host.includes('js/kinto-vendor-media-v1.js?v=20261016-v1'));
 const wrapper=fs.readFileSync('vendor-dashboard.html','utf8');assert(wrapper.includes('vendor-dashboard-v2.html?v=20261016-media-session-v1'));assert(wrapper.includes('vendor-featured-requests-v2.js?v=20261016-media-session-v1'));
 assert(fs.readFileSync('js/local-store-product-details-v4.js','utf8').includes('local-store-product-details-v4-core.js?v=20261016-media-session-v1'));
});
