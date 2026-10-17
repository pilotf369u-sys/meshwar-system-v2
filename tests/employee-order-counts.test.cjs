const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../employee-dashboard.html'),'utf8');
const start=html.indexOf('// Counts use the same session-bound orders client');
const code=html.slice(start,html.indexOf('\nrenderPipelineTabs();',start));
assert(start>0);
assert(!html.includes('employeeRewardDataset('),'removed loyalty helper must never block order counts');
const rows=[{id:'1',status:'تم التسديد',branch_id:null},{id:'2',status:'تجهيز شحن',branch_id:'b'},{id:'3',status:'انتظار رد الموظف',branch_name:''}];
const elements=new Map(),calls=[];
let orderError=null,directoryError=null;
const sb={from(table){assert.equal(table,'orders');calls.push(table);return {select(fields){assert.equal(fields,'status,branch_id,branch_name');return {async limit(){return {data:rows,error:orderError}}}}}}};
const ctx={console:{warn(){},error(){}},cloudId:v=>String(v||''),globalPipelineCounts:{},
 PIPELINES:{all:{all:true},paid:{statuses:['تم التسديد']},branch:{branchAny:true},waiting:{statuses:['انتظار رد الموظف']},rewards:{rewards:true}},
 document:{getElementById(id){if(!elements.has(id))elements.set(id,{});return elements.get(id)}},
 ensureEmployeeSupabase:async()=>sb,
 KintoCustomerDirectoryV1:{from(client){assert.equal(client,sb);return {select(){return {async limit(){return {data:[{id:'c1'},{id:'c2'}],error:directoryError}}}}}}}};
vm.createContext(ctx);vm.runInContext(code,ctx);
(async()=>{
 await ctx.refreshPipelineCounts();
 assert.equal(elements.get('count-all').innerText,'3');assert.equal(elements.get('count-paid').innerText,'1');
 assert.equal(elements.get('count-branch').innerText,'1');assert.equal(elements.get('count-waiting').innerText,'1');
 assert.equal(elements.get('count-rewards').innerText,'2');
 directoryError=new Error('directory unavailable');await ctx.refreshPipelineCounts();
 assert.equal(elements.get('count-all').innerText,'3');assert.equal(elements.get('count-rewards').innerText,'—');
 orderError=new Error('ORDER_SESSION_INVALID');await ctx.refreshPipelineCounts();
 assert.equal(elements.get('count-all').innerText,'—');assert(elements.get('count-all').title);
 orderError=null;directoryError=null;await ctx.refreshPipelineCounts();
 assert.equal(elements.get('count-all').innerText,'3');assert.equal(elements.get('count-all').title,'');
 rows.length=0;await ctx.refreshPipelineCounts();assert.equal(elements.get('count-all').innerText,'0');
 for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(match[1]);
 console.log('PASS employee counters: session client, status/branch counts, customer count, directory isolation, visible errors, recovery, true zero, inline syntax');
})().catch(error=>{console.error(error);process.exitCode=1});
