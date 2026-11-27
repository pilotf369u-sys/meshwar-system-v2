const test=require('node:test'),assert=require('node:assert/strict');
const {list,approved,endpoint}=require('../js/kinto-g16-verified-manual-cards-read-v1.js');
const method={id:'11111111-2222-3333-4444-555555555555',label:'حساب معتمد',
 provider:'مصرف',recipient_name:'مستفيد معتمد',account_reference:'123456789',
 method_type:'manual',is_enabled:true,destination_verified_at:'2026-11-27T05:00:00Z'};
test('read-only catalogue loads server-selected eligible cards',async()=>{
 let called=false;
 const cards=await list({employeeSessionToken:'x'.repeat(40),invoke:async(name,payload)=>{
   called=name===endpoint&&payload.body.action==='list_verified_manual_cards';
   return {data:{ok:true,cards:[method,{...method,id:'second',is_enabled:false}]},error:null};
 }});
 assert.equal(called,true);assert.equal(cards.length,1);
 assert.equal(cards[0].recipient_name,method.recipient_name);
 assert.ok(Object.isFrozen(cards));assert.ok(Object.isFrozen(cards[0]));
});
test('requires an existing employee session and an injected Edge client',async()=>{
 await assert.rejects(()=>list({employeeSessionToken:'short',invoke:async()=>({})}),/EMPLOYEE_SESSION_REQUIRED/);
 await assert.rejects(()=>list({employeeSessionToken:'x'.repeat(40)}),/EDGE_CLIENT_REQUIRED/);
});
test('does not trust disabled, unverified, gateway or missing account records',()=>{
 for(const patch of [{is_enabled:false},{destination_verified_at:null},{method_type:'gateway'},
   {recipient_name:''},{account_reference:''}]) assert.equal(approved({...method,...patch}),false);
});
test('does not fall back to fake or stale cards when backend fails',async()=>{
 await assert.rejects(()=>list({employeeSessionToken:'x'.repeat(40),
  invoke:async()=>({error:{message:'backend down'},data:null})}),/VERIFIED_CARDS_UNAVAILABLE/);
});
