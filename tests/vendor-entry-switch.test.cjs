const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('login.html','utf8');
const find=html.split('\n').find(l=>l.startsWith('async function findVendorByRpc('));
const save=html.split('\n').find(l=>l.startsWith('function saveVendorSession('));
const handler=html.slice(html.indexOf('async function secureAwareLogin('),html.indexOf('window.login=secureAwareLogin;'));
(async()=>{
 const storage=new Map(),calls=[],alerts=[],fields={phone:{value:'store-a'},password:{value:'password-a'}};
 let denied=false;
 const ctx={sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},document:{getElementById:k=>fields[k]},location:{href:''},selectedLoginRole:'vendor',resolvedIdentity:'',alert:m=>alerts.push(m),console:{error(){}},ensureLoginSupabase:async()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:denied?null:{store:{id:args.p_identity,store_name:args.p_identity},session_token:'token-'+args.p_identity,expires_at:'2099-01-01'}}}})};
 vm.createContext(ctx);vm.runInContext(find+'\n'+save+'\n'+handler,ctx);
 await ctx.secureAwareLogin();assert.equal(ctx.location.href,'vendor-dashboard.html');assert.equal(JSON.parse(storage.get('meshwar_vendor_store')).id,'store-a');assert.equal(JSON.parse(storage.get('meshwar_vendor_session_v95')).token,'token-store-a');
 fields.phone.value='store-b';fields.password.value='password-b';ctx.location.href='';
 await ctx.secureAwareLogin();assert.equal(JSON.parse(storage.get('meshwar_vendor_store')).id,'store-b');assert.deepEqual(JSON.parse(storage.get('meshwar_vendor_session_v95')),{token:'token-store-b',expiresAt:'2099-01-01',storeId:'store-b'});assert.equal(ctx.location.href,'vendor-dashboard.html');assert(calls.every(c=>c.name==='vendor_login_session'));
 denied=true;ctx.location.href='';await ctx.secureAwareLogin();assert.equal(ctx.location.href,'');assert.equal(JSON.parse(storage.get('meshwar_vendor_session_v95')).token,'token-store-b');assert(alerts.length);
 const native=fs.readFileSync('vendor-dashboard-v2.html','utf8'),guard=native.match(/<script id="vendor-canonical-entry-v1">([\s\S]*?)<\/script>/)[1];
 let replaced='';const top={},frame={};const direct={window:{top,self:top},document:{documentElement:{style:{}}},location:{search:'?v=20261011-v167-growth',hash:'#orders',replace:url=>replaced=url}};vm.createContext(direct);vm.runInContext(guard,direct);assert.equal(replaced,'vendor-dashboard.html?v=20261011-v167-growth#orders');assert.equal(direct.document.documentElement.style.visibility,'hidden');
 replaced='';const embedded={window:{top,self:frame},document:{documentElement:{style:{}}},location:{replace:url=>replaced=url}};vm.createContext(embedded);vm.runInContext(guard,embedded);assert.equal(replaced,'');
 console.log('PASS general login store A to B replaces token and store atomically; invalid login preserves current pair; old direct V2 link redirects and embedded frame stays intact');
})().catch(e=>{console.error(e);process.exit(1)});

