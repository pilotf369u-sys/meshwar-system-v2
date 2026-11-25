const test=require('node:test'),assert=require('node:assert/strict');
const {create,method}=require('../js/kinto-g16-card-api-v1.js');
const session='a'.repeat(32),methodId='11111111-1111-4111-8111-111111111111',challengeId='22222222-2222-4222-8222-222222222222';
test('rejects missing authenticated invoker/session and arbitrary card IDs',async()=>{
 assert.throws(()=>create(),/API_INVOKER_REQUIRED/);
 assert.throws(()=>method('../steal'),/INVALID_METHOD_ID/);
 await assert.rejects(()=>create(async()=>({data:{ok:true}})).employeeCards('short'),/SESSION_TOKEN_REQUIRED/);
});
test('employee fetch is read-only and never sends financial transitions',async()=>{
 const calls=[],api=create(async(name,payload)=>{calls.push({name,payload});return{data:{ok:true,cards:[]}}});
 await api.employeeCards(session);
 assert.equal(calls.length,1);assert.equal(calls[0].name,'kinto-card-images-v1');
 assert.equal(calls[0].payload.body.action,'employee_cards');
 assert.equal(calls[0].payload.body.payment_status,undefined);
});
test('OTP request includes only method ID and make-default choice',async()=>{
 const calls=[],api=create(async(_,payload)=>{calls.push(payload.body);return{data:{ok:true,challenge_id:challengeId}}});
 await api.adminRequestOtp(session,methodId,true);
 assert.deepEqual(Object.keys(calls[0]).sort(),['action','make_default','method_id','session_token'].sort());
 assert.equal(calls[0].make_default,true);
});
test('image commit rejects non-WebP, oversized bytes and invalid OTP without sending',async()=>{
 let invoked=0;const api=create(async()=>{invoked++;return{data:{ok:true}}});
 await assert.rejects(()=>api.adminCommitImage(session,methodId,challengeId,'12345',{type:'image/webp',size:50,arrayBuffer:async()=>new ArrayBuffer(50)}),/INVALID_OTP_FORMAT/);
 await assert.rejects(()=>api.adminCommitImage(session,methodId,challengeId,'123456',{type:'image/svg+xml',size:50,arrayBuffer:async()=>new ArrayBuffer(50)}),/COMPRESSED_WEBP_REQUIRED/);
 await assert.rejects(()=>api.adminCommitImage(session,methodId,challengeId,'123456',{type:'image/webp',size:204801,arrayBuffer:async()=>new ArrayBuffer(204801)}),/COMPRESSED_WEBP_REQUIRED/);
 assert.equal(invoked,0);
});
test('API errors fail closed and do not expose backend text',async()=>{
 const api=create(async()=>({error:{message:'internal sensitive token details'}}));
 await assert.rejects(()=>api.employeeCards(session),/CARD_IMAGE_API_UNAVAILABLE/);
});
