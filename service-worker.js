/* KINTO PWA isolated foundation v275
 * Network-only navigation. No page, commerce, auth or API responses are cached.
 * Connectivity UX is handled inside already-open KINTO pages.
 */
const VERSION='kinto-pwa-v275';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith('kinto-pwa-')).map(key=>caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET'||req.mode!=='navigate')return;
  event.respondWith(fetch(req));
});
