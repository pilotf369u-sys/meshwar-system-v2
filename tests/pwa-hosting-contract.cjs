const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
(async()=>{
for(const scope of ['https://shopkinto.com/','https://pilotf369u-sys.github.io/meshwar-system-v2/']){
const handlers={},added=[],deleted=[],cache={addAll:async x=>added.push(...x)};
let offline=false,fetches=0;
const sandbox={URL,Response,self:{registration:{scope},location:{origin:new URL(scope).origin},addEventListener:(n,fn)=>handlers[n]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{}}},caches:{open:async()=>cache,keys:async()=>['kinto-pwa-old','unrelated'],delete:async k=>deleted.push(k),match:async key=>key===scope+'offline.html'?'OFFLINE':undefined},fetch:async()=>{fetches++;if(offline)throw Error('offline');return 'NETWORK'}};
vm.runInNewContext(fs.readFileSync('service-worker.js','utf8'),sandbox);
let pending;await handlers.install({waitUntil:p=>pending=p});await pending;assert.deepEqual(added,[scope+'offline.html',scope+'images/meshwar-logo.png']);
handlers.activate({waitUntil:p=>pending=p});await pending;assert.deepEqual(deleted,['kinto-pwa-old']);
async function request(url,mode='cors',method='GET'){let result;handlers.fetch({request:{url,mode,method},respondWith:p=>result=p});return result===undefined?undefined:await result;}
assert.equal(await request(scope+'dashboard.html','navigate'),'NETWORK');offline=true;assert.equal(await request(scope+'dashboard.html','navigate'),'OFFLINE');
for(const u of [scope+'js/app.js',scope+'rest/v1/orders','https://example.supabase.co/auth/v1/token'])assert.equal(await request(u),undefined);
assert.equal(await request(scope+'checkout','cors','POST'),undefined);assert.equal(fetches,2);
}
JSON.parse(fs.readFileSync('manifest.json'));JSON.parse(fs.readFileSync('.well-known/assetlinks.json'));
console.log('PASS: root/subpath install, cache cleanup, online/offline navigation, commerce/API bypass');
})().catch(e=>{console.error(e);process.exit(1)});
