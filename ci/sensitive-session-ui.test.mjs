import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
test('campaign load/approve/reject send session token and never caller admin ID',async()=>{
 const calls=[];let token='verified-test-token';const elements=new Map(['featuredRequestsPhase2','phase2Status','phase2Requests'].map(id=>[id,{innerHTML:'',textContent:'',querySelectorAll:()=>[]}]));
 const sb={rpc:async(name,args)=>{calls.push({name,args});return {data:[]}}};
 const context={window:{KintoAdminSessionV147:{read:()=>token?{token}:null},dispatchEvent:()=>{}},document:{readyState:'loading',addEventListener:()=>{},getElementById:id=>elements.get(id)},verifyAdmin:async()=>{},getSb:async()=>sb,console:{error:()=>{},info:()=>{}},confirm:()=>true,CustomEvent:class{}};
 vm.createContext(context);const source=fs.readFileSync('js/admin-featured-requests-v2.js','utf8').replace('function boot(){','window.testActions={approve,reject};function boot(){');vm.runInContext(source,context);
 await context.window.MeshwarAdminFeaturedRequestsV2.load();
 const card={dataset:{request:'request-1'},remove:()=>{},querySelector:selector=>({value:({'[data-merchant]':'store-1','[data-start]':'2026-10-16T10:00','[data-end]':'2026-10-17T10:00','[data-note]':'ok'})[selector]})};
 await context.window.testActions.approve(card,{});await context.window.testActions.reject(card,{});
 for(const name of ['admin_list_featured_requests_session_v1','list_featured_merchants_session_v1','admin_approve_featured_request_session_v1','admin_reject_featured_request_session_v1'])assert(calls.some(c=>c.name===name),name);
 for(const c of calls){assert.equal(c.args.p_session_token,token);assert(!('p_admin_id' in c.args));}
 token=null;const before=calls.length;await context.window.MeshwarAdminFeaturedRequestsV2.load();await context.window.testActions.approve(card,{});await context.window.testActions.reject(card,{});assert.equal(calls.length,before);
});
