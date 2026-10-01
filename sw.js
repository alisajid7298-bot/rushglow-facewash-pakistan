self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.map(key=>caches.delete(key)));
    await self.registration.unregister();
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    windows.forEach(client=>client.navigate(client.url));
  })());
});
// Service worker intentionally has no fetch handler.
// Rush Glow stays network-first so iPhone Home Screen never receives stale blank HTML.
