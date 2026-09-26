/* KINTO PWA isolated foundation v275
 * Public-shell offline support only.
 * Customer/auth/API/commerce responses are never cached here.
 */
const VERSION='kinto-pwa-v275-offline-ui-1';
const PUBLIC_SHELL=['/index.html','/local-stores.html','/global-stores.html','/store.html','/js/kinto-connectivity-v275.js'];
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(VERSION);
  await Promise.all(PUBLIC_SHELL.map(url=>cache.add(url).catch(()=>null)));
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith('kinto-pwa-')&&key!==VERSION).map(key=>caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;
  if(req.mode==='navigate'){
    const path=url.pathname==='/'?'/index.html':url.pathname;
    if(!PUBLIC_SHELL.includes(path))return event.respondWith(fetch(req));
    event.respondWith((async()=>{
      try{
        const response=await fetch(req);
        if(response&&response.ok){
          const cache=await caches.open(VERSION);
          cache.put(path,response.clone()).catch(()=>{});
        }
        return response;
      }catch(error){
        const cached=await caches.match(path);
        if(cached)return cached;
        throw error;
      }
    })());
    return;
  }
  if(url.pathname==='/js/kinto-connectivity-v275.js'){
    event.respondWith(fetch(req).catch(()=>caches.match('/js/kinto-connectivity-v275.js')));
  }
});
