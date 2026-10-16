import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
export async function verifyDatabaseUi(db,id){
 const calls=[];let token='admin-1';let removed=0;
 await db.exec(`insert into merchant_featured_requests(id,status,store_id,slot_type) values('${id(32)}','pending','${id(20)}','hero_banner'),('${id(33)}','pending','${id(20)}','hero_banner'),('${id(34)}','pending','${id(20)}','hero_banner');`);
 const sb={rpc:async(name,args)=>{calls.push({name,args});await db.exec('set role anon');try{return {data:(await db.query(`select * from public.${name}(${Object.keys(args).map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(args))).rows}}catch(error){return {error}}finally{await db.exec('reset role')}}};
 const elements=new Map(['featuredRequestsPhase2','phase2Status','phase2Requests'].map(id=>[id,{innerHTML:'',textContent:'',querySelectorAll:()=>[]}]));
 const context={window:{KintoAdminSessionV147:{read:()=>({token})},dispatchEvent:()=>{}},document:{readyState:'loading',addEventListener:()=>{},getElementById:id=>elements.get(id)},verifyAdmin:async()=>{},getSb:async()=>sb,console:{error:()=>{},info:()=>{}},confirm:()=>true,CustomEvent:class{}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('js/admin-featured-requests-v2.js','utf8').replace('function boot(){','window.testActions={approve,reject};function boot(){'),context);
 const card=n=>({dataset:{request:id(n)},remove:()=>removed++,querySelector:selector=>({value:({'[data-merchant]':id(20),'[data-start]':'2026-10-16T10:00','[data-end]':'2026-10-17T10:00','[data-note]':'integration'})[selector]})});
 await context.window.MeshwarAdminFeaturedRequestsV2.load();await context.window.testActions.approve(card(32),{});await context.window.testActions.reject(card(33),{});
 assert.equal(removed,2);const rows=(await db.query('select status,reviewed_by from merchant_featured_requests where id in ($1,$2) order by id',[id(32),id(33)])).rows;
 assert.deepEqual(rows,[{status:'approved',reviewed_by:id(1)},{status:'rejected',reviewed_by:id(1)}]);
 for(const c of calls){assert.equal(c.args.p_session_token,'admin-1');assert(!('p_admin_id' in c.args));}
 token='admin-revoked';const button={};await context.window.testActions.approve(card(34),button);assert.equal(removed,2);assert.equal(button.disabled,false);
 assert.equal((await db.query('select status from merchant_featured_requests where id=$1',[id(34)])).rows[0].status,'pending');
 assert.match(elements.get('phase2Status').textContent,/ADMIN_SESSION_INVALID/);
 console.log('PASS: actual campaign UI -> anon SQL role -> session RPC -> database state; revoked session leaves pending request unchanged');
}
