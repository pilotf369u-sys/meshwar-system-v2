/* KINTO PWA isolated foundation v275
 * Only the dedicated offline fallback and KINTO logo are cached.
 * Commerce, auth, customer, store and API responses are never cached.
 */
const VERSION='kinto-pwa-v275-offline-fallback-1';
const OFFLINE='/offline.html';
const OFFLINE_ASSETS=[OFFLINE,'/images/meshwar-logo.png'];
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(VERSION);
  await cache.addAll(OFFLINE_ASSETS);
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
    event.respondWith(fetch(req).catch(async()=>{
      const cached=await caches.match(OFFLINE);
      return cached||Response.error();
    }));
    return;
  }
  if(url.pathname==='/images/meshwar-logo.png'){
    event.respondWith(caches.match('/images/meshwar-logo.png').then(cached=>cached||fetch(req)));
  }
});
