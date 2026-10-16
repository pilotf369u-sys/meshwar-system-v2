import {test,expect} from '@playwright/test';import fs from 'node:fs';
const source=fs.readFileSync('js/kinto-attachment-access-v1.js','utf8');
test('private attachment display uses signed links without changing persisted message/order URLs',async({page})=>{
 await page.route('**/__attachment_fixture__',r=>r.fulfill({status:200,contentType:'text/html',body:'<html><head></head><body></body></html>'}));
 await page.route('**/storage/v1/object/**',r=>r.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8S8AAAAASUVORK5CYII=','base64')}));
 await page.goto('/__attachment_fixture__');
 await page.evaluate(()=>{
  window.KintoCustomerDirectoryV1={session:()=>({role:'customer',token:'customer-session'})};window.signRequests=[];
  window.original='https://hsmmbloouskqdnptiiad.supabase.co/storage/v1/object/public/chat-attachments/customer/own/file.png';window.order={details:{delivery_proof_url:window.original}};
  window.fetch=async(_url,init)=>{const args=JSON.parse(init.body);window.signRequests.push(args);return new Response(JSON.stringify({urls:Object.fromEntries(args.paths.map(p=>[p,'https://hsmmbloouskqdnptiiad.supabase.co/storage/v1/object/sign/chat-attachments/'+p+'?token=test-signed']))}),{status:200})};
  document.body.innerHTML='<img id="proof" src="'+window.original+'"><a id="file" href="'+window.original+'">attachment</a>';
 });
 await page.addScriptTag({content:source});await expect(page.locator('#proof')).toHaveAttribute('src',/\/object\/sign\//);await expect(page.locator('#file')).toHaveAttribute('href',/token=test-signed/);
 expect(await page.evaluate(()=>window.order.details.delivery_proof_url)).toContain('/object/public/');expect(await page.evaluate(()=>window.signRequests[0])).toMatchObject({role:'customer',session_token:'customer-session',paths:['customer/own/file.png']});
 await page.evaluate(()=>KintoAttachmentAccessV1.refresh());expect(await page.evaluate(()=>window.signRequests.length)).toBe(1);
});
test('ticketed upload binds session and target, returning a stable canonical path for storage in the order',async({page})=>{
 await page.route('**/__attachment_fixture__',r=>r.fulfill({status:200,contentType:'text/html',body:'<html><body></body></html>'}));await page.goto('/__attachment_fixture__');
 await page.evaluate(()=>{window.KintoCustomerDirectoryV1={session:()=>({role:'courier',token:'courier-session'})}});await page.addScriptTag({content:source});
 const r=await page.evaluate(async()=>{const calls=[];const sb={rpc:async(name,args)=>{calls.push({name,args});return{data:{bucket:'chat-attachments',path:'courier/one/proof.png',mime_type:'image/png'}}},storage:{from:bucket=>({upload:async(path,_file,options)=>{calls.push({bucket,path,options});return {error:null}}})}};const url=await KintoAttachmentAccessV1.upload(sb,new File(['test'],'proof.png',{type:'image/png'}),'proof','order-1');return{url,calls}});
 expect(r.calls[0]).toMatchObject({name:'kinto_attachment_ticket_session_v1',args:{p_role:'courier',p_session_token:'courier-session',p_purpose:'proof',p_target_id:'order-1',p_byte_size:4}});expect(r.calls[1]).toMatchObject({bucket:'chat-attachments',options:{upsert:false,contentType:'image/png'}});expect(r.url).toContain('/object/public/chat-attachments/courier/one/proof.png');
});
