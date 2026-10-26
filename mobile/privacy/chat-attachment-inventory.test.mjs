import test from 'node:test';
import assert from 'node:assert/strict';
import {attachmentKey, inventoryAttachments} from './chat-attachment-inventory.mjs';
const origin='https://storage.example.invalid';
const url=(key,mode='public')=>`${origin}/storage/v1/object/${mode}/chat-attachments/${key}`;
test('public database references and ephemeral signed URLs resolve to the same exact key',()=>{
 assert.equal(attachmentKey(url('employee/a/photo.jpg'),origin),'employee/a/photo.jpg');
 assert.equal(attachmentKey(url('employee/a/photo.jpg','sign')+'?token=SECRET',origin),'employee/a/photo.jpg');
 assert.equal(attachmentKey(url('customer/a/my%20photo.jpg'),origin),'customer/a/my photo.jpg');
});
test('malformed, cross-origin, wrong bucket and normalized traversal cannot establish identity',()=>{
 for(const input of [url('../secret'),url('%2e%2e/secret'),url('a%2fb'),url('a%252fb'),url('a\\b'),url('a//b'),url('x')+'#secret',url('x').replace('chat-attachments','product-review-images'),url('x').replace(origin,'https://attacker.invalid'),'/relative',url('x').replace('https://','https://user:pass@')]) assert.equal(attachmentKey(input,origin),null,input);
});
test('shared messages and operational evidence are held without exposing contents or capability URLs',()=>{
 const messages=[{id:'9223372036854775807',customer_id:'A',file_url:url('employee/a/proof.png','sign')+'?token=SECRET',message:'PRIVATE'}, {id:'2',customer_id:'B',file_url:url('employee/a/proof.png')}];
 const before=JSON.stringify(messages);
 const result=inventoryAttachments({customerId:'A',messages,protectedReferences:[{url:url('employee/a/proof.png'),kind:'shipping_proof'}],storageOrigin:origin});
 assert.equal(result.length,1);assert.equal(result[0].message_id,'9223372036854775807');
 assert(result[0].holds.includes('SHARED_MESSAGE_REFERENCE'));assert(result[0].holds.includes('PROTECTED_OPERATIONAL_REFERENCE'));
 assert.equal(result[0].deletion_authorized,false);assert.equal(result[0].account_deleted,false);
 assert(!/SECRET|PRIVATE|proof.png/.test(JSON.stringify(result)));assert.equal(JSON.stringify(messages),before);
});
test('apparently unique attachment still cannot authorize deletion or claim full coverage',()=>{
 const result=inventoryAttachments({customerId:'A',messages:[{id:'1',customer_id:'A',file_url:url('customer/a/file.jpg')},{id:'2',customer_id:'B',file_url:'unknown-legacy-path'}],protectedReferences:[],storageOrigin:origin});
 assert(result[0].holds.includes('UNRESOLVED_OTHER_REFERENCE'));assert(result[0].holds.includes('COVERAGE_NOT_VERIFIED'));assert.equal(result[0].deletion_authorized,false);
});
