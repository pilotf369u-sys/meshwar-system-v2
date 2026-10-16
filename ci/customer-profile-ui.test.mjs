import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync('dashboard.html','utf8');
const source=html.slice(html.indexOf('async function updateCustomerProfileV1('),html.indexOf('\n',html.indexOf('async function saveSecondaryPhone(')));
function fixture(){
 const calls=[],alerts=[],fields={userAddress:{value:' New address '},userGovernorate:{value:' Erbil '},userSecondaryPhone:{value:' 07700000000 '}};
 const context={currentCustomerCloud:{id:'untrusted-client-id',address:'original',state:'Baghdad',secondary_phone:'old'},currentCustomerOrdersGlobal:[{}],denyStaffCustomerMutationV151:()=>false,customerChatTokenV61:()=> 'verified-session',document:{getElementById:id=>fields[id]},alert:message=>alerts.push(message),console:{error:()=>{}},renderCurrentCustomer:()=>{},ensureCustomerPortalSupabase:async()=>({from:()=>{throw Error('DIRECT_TABLE_FORBIDDEN')},rpc:async(name,args)=>{calls.push({name,args});return {data:{ok:true,profile:{id:'server-customer-id',address:'New address',state:'Erbil',secondary_phone:args.p_patch.secondary_phone===undefined?'old':args.p_patch.secondary_phone}}}}})};
 vm.createContext(context);vm.runInContext(source,context);return {context,calls,alerts,fields};
}
test('actual customer address and phone controllers use the session and server result',async()=>{
 const {context,calls}=fixture();await context.saveAddress();await context.saveSecondaryPhone();
 assert.equal(calls.length,2);for(const {name,args} of calls){assert.equal(name,'customer_update_profile_session_v1');assert.equal(args.p_session_token,'verified-session');assert(!('p_customer_id' in args));}
 assert.deepEqual(JSON.parse(JSON.stringify(calls[0].args.p_patch)),{address:'New address',state:'Erbil'});
 assert.equal(calls[1].args.p_patch.secondary_phone,'07700000000');assert.equal(context.currentCustomerCloud.id,'server-customer-id');assert.equal(context.currentCustomerOrdersGlobal[0]._secondary_phone,'07700000000');
});
test('delegated staff view cannot mutate and missing sessions never reach the RPC',async()=>{
 const {context,calls}=fixture();context.denyStaffCustomerMutationV151=()=>true;await context.saveAddress();await context.saveSecondaryPhone();assert.equal(calls.length,0);
 context.denyStaffCustomerMutationV151=()=>false;context.customerChatTokenV61=()=>{throw Error('CUSTOMER_SESSION_REQUIRED')};await context.saveAddress();await context.saveSecondaryPhone();assert.equal(calls.length,0);assert.equal(context.currentCustomerCloud.address,'original');
});
test('save failure preserves displayed profile and reports failure without direct fallback',async()=>{
 const {context,alerts}=fixture();context.ensureCustomerPortalSupabase=async()=>({rpc:async()=>({error:{message:'REVIEW_SESSION_INVALID'}})});
 await context.saveAddress();await context.saveSecondaryPhone();assert.equal(context.currentCustomerCloud.address,'original');assert.equal(context.currentCustomerCloud.secondary_phone,'old');assert.equal(alerts.length,2);assert(alerts.every(x=>x.includes('REVIEW_SESSION_INVALID')));
});
