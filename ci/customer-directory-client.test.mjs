import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync('js/kinto-customer-directory-v1.js','utf8');
function fixture(role='admin',query=''){
 const storage=new Map(),calls=[],local=new Map();const context={window:{},document:{currentScript:{dataset:{role}}},location:{search:query},URLSearchParams,sessionStorage:{getItem:k=>storage.get(k)||null},localStorage:{getItem:k=>local.get(k)||null}};vm.createContext(context);vm.runInContext(source,context);
 const sb={rpc:async(name,args)=>{calls.push({name,args});return {data:{rows:[{id:'one',name:'Customer',phone:'123',address:'Delivery address'}],count:11}}}};
 return {api:context.window.KintoCustomerDirectoryV1,storage,local,calls,sb,context};
}
test('missing/expired sessions and logged-out customers fail without network fallback',async()=>{
 for(const role of ['customer','vendor','admin','employee','branch','courier']){const x=fixture(role);const result=await x.api.from(x.sb);assert(result.error);assert.equal(x.calls.length,0);}
 const x=fixture('customer');x.local.set('kinto_customer_session_v150',JSON.stringify({token:'persisted'}));x.local.set('kinto_customer_logged_out_v150','1');assert((await x.api.from(x.sb)).error);assert.equal(x.calls.length,0);
});
test('actual adapter preserves pagination/count/search/projection and sends no actor ID',async()=>{
 const x=fixture();x.storage.set('kinto_admin_session_v147',JSON.stringify({token:'admin-token'}));const q=x.api.from(x.sb).select('id,name',{count:'exact'}).or('name.ilike.%Customer%,phone.ilike.%Customer%').not('code','is',null).in('id',['one']).order('name',{ascending:false}).range(10,19);const r=await q;assert.equal(r.count,11);assert.equal(r.data[0].name,'Customer');assert(!('phone' in r.data[0]));await q;assert.equal(x.calls.length,1);const {args}=x.calls[0];assert.equal(args.p_offset,10);assert.equal(args.p_limit,10);assert.equal(args.p_search,'Customer');assert.equal(args.p_role,'admin');assert(!('p_admin_id' in args));assert.equal(args.p_filters[0].op,'not_null');
});
test('a manifest selects the route role even when another account is also signed in',async()=>{
 const x=fixture('manifest','?branchId=b1');x.storage.set('kinto_admin_session_v147',JSON.stringify({token:'admin-token'}));x.storage.set('kinto_branch_session_v148',JSON.stringify({token:'branch-token'}));await x.api.from(x.sb);assert.equal(x.calls[0].args.p_session_token,'branch-token');assert.equal(x.calls[0].args.p_role,'branch');
});
test('delegated dashboard invoices retain their validated staff session and reject mismatches',async()=>{
 const x=fixture('customer-view','?viewedBy=employee&customerId=one');x.storage.set('kinto_staff_customer_view_v151',JSON.stringify({role:'employee',customerId:'one',token:'delegated',createdAt:Date.now()}));assert(!(await x.api.from(x.sb).eq('id','one').maybeSingle()).error);assert.equal(x.calls[0].args.p_role,'employee');x.storage.set('kinto_staff_customer_view_v151',JSON.stringify({role:'employee',customerId:'other',token:'delegated',createdAt:Date.now()}));assert((await x.api.from(x.sb)).error);assert.equal(x.calls.length,1);
});
test('REST-only cart and invoice adapters use the same session RPC',async()=>{
 const x=fixture('vendor');x.storage.set('meshwar_vendor_session_v95',JSON.stringify({token:'vendor-token'}));x.context.fetch=async(url,options)=>{x.calls.push({url,args:JSON.parse(options.body)});return {ok:true,json:async()=>({rows:[{id:'one',address:'Delivery address'}],count:1})}};
 const r=await x.api.from(null).eq('id','one').maybeSingle();assert.equal(r.data.address,'Delivery address');assert(x.calls[0].url.endsWith('/rpc/kinto_customer_directory_session_v1'));assert.equal(x.calls[0].args.p_role,'vendor');
});
test('all shipped customer reads and their hosts use the directory; registration stays admin-managed',()=>{
 const files=[...fs.readdirSync('.').filter(x=>x.endsWith('.html')),...fs.readdirSync('js').filter(x=>x.endsWith('.js')).map(x=>'js/'+x)];
 for(const file of files){const text=fs.readFileSync(file,'utf8');assert(!/\.from\(['"]customers['"]\)|customers\?select=|customers!orders_customer_id_fkey/.test(text),file);}
 const roles={'index.html':'customer','local-stores.html':'customer','store.html':'customer','order.html':'customer','dashboard.html':'customer-view','admin-dashboard.html':'admin','employee-dashboard.html':'employee','branch-dashboard.html':'branch','branch-manifest.html':'manifest','delivery-dashboard.html':'courier','vendor-dashboard.html':'vendor','vendor-dashboard-v2.html':'vendor'};
 for(const [file,role]of Object.entries(roles)){const text=fs.readFileSync(file,'utf8');assert(text.includes(`src="js/kinto-customer-directory-v1.js?v=20261016-v1" data-role="${role}"`),file);assert(text.indexOf('js/kinto-customer-directory-v1.js')<text.indexOf('async function')||!text.includes('async function'),file);}
 assert(fs.readFileSync('js/kinto-registration-country-phone-v163.js','utf8').includes('https://wa.me/'));assert(fs.readFileSync('admin-dashboard.html','utf8').includes("sb.rpc('admin_save_account_v300'"));
});
