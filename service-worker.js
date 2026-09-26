/* KINTO PWA isolated foundation v275
 * Network-first navigation: no commerce/auth/API responses are cached.
 * This worker intentionally avoids offline caching until the app path is validated.
 */
const VERSION='kinto-pwa-v275';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith('kinto-pwa-')&&key!==VERSION).map(key=>caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET'||req.mode!=='navigate')return;
  event.respondWith(fetch(req));
});
