// Real SDK + real loopback HTTP transport. This is NOT a Supabase Storage service.
// Install @supabase/storage-js outside the checkout; point KINTO_STORAGE_JS_MODULE
// at its dist/index.mjs. No production endpoint is ever requested.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import http from 'node:http';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';

test('actual vendor upload controllers send ticketed image bytes over local HTTP',async()=>{
 const modulePath=process.env.KINTO_STORAGE_JS_MODULE;
 const {StorageClient}=await import(modulePath?pathToFileURL(modulePath).href:'@supabase/storage-js');
 const requests=[],ticketRequests=[];
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64');
 let denyUpload=false;
 const server=http.createServer(async(req,res)=>{
  try{
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const body=Buffer.concat(chunks);
   res.setHeader('Content-Type','application/json');
   if(req.url==='/rest/v1/rpc/vendor_create_media_upload_session_v1'){
    const args=JSON.parse(body);ticketRequests.push(args);
    assert.equal(args.p_byte_size,bytes.length);assert.equal(args.p_mime_type,'image/png');
    res.end(JSON.stringify({bucket:'product-images',path:`store-1/wire-${ticketRequests.length}.png`,mime_type:'image/png'}));return;
   }
   assert.match(req.url,/^\/storage\/v1\/object\/product-images\/store-1\/wire-\d+\.png$/);
   assert.equal(req.headers['x-upsert'],'false');
   const contentType=req.headers['content-type'];
   const request=new Request('http://127.0.0.1'+req.url,{method:'POST',headers:{'Content-Type':contentType},body});
   let file;
   if(contentType.startsWith('multipart/form-data')){
    const form=await request.formData();assert.equal(form.get('cacheControl'),'31536000');
    file=form.get('');assert.equal(file.type,'image/png');
    assert.deepEqual(Buffer.from(await file.arrayBuffer()),bytes);
    assert(body.length>file.size,'multipart envelope must exceed image byte size');
   }else{
    assert.equal(contentType,'image/png');assert.deepEqual(body,bytes);
   }
   requests.push({multipart:!!file,imageSize:bytes.length,bodySize:body.length,contentType});
   if(denyUpload){res.statusCode=403;res.end(JSON.stringify({statusCode:'403',error:'AccessDenied',message:'new row violates row-level security policy'}));}
   else res.end(JSON.stringify({Id:'local-wire-only',Key:req.url.split('/object/')[1]}));
  }catch(error){res.statusCode=500;res.end(JSON.stringify({message:error.message}));}
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const origin=`http://127.0.0.1:${server.address().port}`;
 const localFetch=(url,options)=>{
  const u=new URL(url);
  // The existing helper's literal production URL is rewritten ONLY for this RPC.
  if(u.pathname==='/rest/v1/rpc/vendor_create_media_upload_session_v1')return fetch(origin+u.pathname,options);
  assert.equal(u.origin,origin,'EXTERNAL_NETWORK_FORBIDDEN');return fetch(url,options);
 };
 try{
  for(const kind of ['product','promotion','multi']){
   const storage=new StorageClient(origin+'/storage/v1',{apikey:'local-test-key',Authorization:'Bearer local-test-key'},localFetch);
   const sb={storage};
   const context={window:{},sessionStorage:{getItem:()=>JSON.stringify({token:'synthetic-only',expiresAt:'2099-01-01'})},fetch:localFetch,Date,File,Blob,FormData,sb,PRODUCT_IMAGES_BUCKET:'product-images',BUCKET:'product-images',SB_URL:origin,SB_KEY:'local-test-key',vendorStore:kind==='product'?{id:'store-1'}:()=>({id:'store-1'}),getClient:async()=>sb};
   vm.createContext(context);vm.runInContext(fs.readFileSync('js/kinto-vendor-media-v1.js','utf8'),context);
   let source,fn,args;
   const file=new File([bytes],'pixel.png',{type:'image/png'});
   if(kind==='product'){
    const s=fs.readFileSync('vendor-dashboard-v2.html','utf8');
    source=s.slice(s.indexOf('async function uploadProductImage('),s.indexOf('function previewSelectedProductImage('));fn='uploadProductImage';args=[file];
   }else if(kind==='promotion'){
    source=fs.readFileSync('js/vendor-featured-requests-v2.js','utf8').split('\n').find(x=>x.startsWith('async function uploadAsset('));fn='uploadAsset';args=[file,'banner'];
   }else{
    source=fs.readFileSync('js/local-store-product-details-v4-core.js','utf8').split('\n').find(x=>x.includes('async function uploadFile('));fn='uploadFile';args=[file,'store-1'];
   }
   vm.runInContext(source,context);
   denyUpload=false;const url=await context[fn](...args);
   assert(url.startsWith(origin+'/storage/v1/object/public/product-images/store-1/wire-'));
   assert.equal(requests.at(-1).multipart,kind!=='multi');
   denyUpload=true;
   await assert.rejects(()=>context[fn](...args),/row-level security policy/);
  }
  assert.equal(requests.length,6);assert.equal(ticketRequests.length,6);
  console.log('Transport verified: 6 local requests; SDK paths use multipart, multi-image uses raw PNG; 403 propagates. No actual Storage upload claimed.');
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
