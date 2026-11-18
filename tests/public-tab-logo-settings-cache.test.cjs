// Offline browser-tab logo contract; all CMS RPCs are mocked in-memory.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const src=fs.readFileSync('js/kinto-shared-tab-brand-v1.js','utf8');
const HOME_KEY='kinto_public_contacts_settings_v1',BRAND_KEY='kinto_public_tab_brand_v1';
function run({cached={},settings={brand_logo_url:'https://assets.test/logo.webp'},rpcAvailable=true}={}){
 const memory=new Map(Object.entries(cached)),icons=[],calls=[],imgs=[];
 const doc={readyState:'complete',head:{appendChild(){}},
   querySelector:()=>null,createElement:()=>({}),
   addEventListener(){throw Error('Unexpected wait for DOMContentLoaded');}};
 const context={document:doc,location:{href:'https://shopkinto.com/store.html'},
  sessionStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)},
  window:{KintoSupabase:rpcAvailable?{rpc:async name=>{calls.push(name);return {data:settings,error:null}}}:null},
  Image:class{set src(u){imgs.push(u);if(this.onload)this.onload()}},
  URL,Date,console:{warn(){}},setTimeout:()=>{}};
 // Track favicon creation using querySelector for each rel.
 const nodes={};
 doc.querySelector=selector=>nodes[selector]||null;
 doc.createElement=()=>({href:'',type:'',rel:''});
 doc.head.appendChild=node=>{nodes['link[rel="'+node.rel+'"]']=node;icons.push(node)};
 vm.runInNewContext(src,context,{filename:'kinto-shared-tab-brand-v1.js'});
 const after=async()=>{await new Promise(resolve=>setImmediate(resolve));return {calls,icons,nodes,imgs,memory}};
 return after;
}
test('fresh homepage public settings avoid another CMS RPC',async()=>{
 const r=await run({cached:{[HOME_KEY]:JSON.stringify({at:Date.now(),data:{brand_logo_url:'https://assets.test/home.webp'}})}})();
 assert.deepEqual(r.calls,[]);
 assert.equal(r.nodes['link[rel="icon"]'].href,'https://assets.test/home.webp');
});
test('missing settings request once and reuse logo in same-tab navigation',async()=>{
 const first=await run()();
 assert.deepEqual(first.calls,['get_site_settings']);
 const cache=first.memory.get(BRAND_KEY);
 assert.ok(cache);
 const second=await run({cached:{[BRAND_KEY]:cache},rpcAvailable:false})();
 assert.deepEqual(second.calls,[]);
 assert.equal(second.nodes['link[rel="icon"]'].href,'https://assets.test/logo.webp');
});
test('expired CMS settings do not block a fresh read',async()=>{
 const stale=JSON.stringify({at:Date.now()-61_000,data:{brand_logo_url:'https://assets.test/old.webp'}});
 const r=await run({cached:{[HOME_KEY]:stale}})();
 assert.deepEqual(r.calls,['get_site_settings']);
 assert.equal(r.nodes['link[rel="icon"]'].href,'https://assets.test/logo.webp');
});
test('reject javascript CMS logo URLs and keep safe fallback',async()=>{
 const r=await run({settings:{brand_logo_url:'javascript:alert(1)'}})();
 assert.deepEqual(r.calls,['get_site_settings']);
 assert.match(r.nodes['link[rel="icon"]'].href,/kinto-header-logo/);
 assert.equal(r.memory.has(BRAND_KEY),false);
});
