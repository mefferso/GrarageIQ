// GarageIQ PWA: keep installability without pinning stale app versions.
const CACHE="garageiq-shell-v7";
self.addEventListener("install",event=>{self.skipWaiting()});
self.addEventListener("activate",event=>{
 event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith("garageiq-shell-")).map(key=>caches.delete(key)));
  await self.clients.claim();
 })());
});
// Use browser networking and HTTP caching; never serve an old application shell.
