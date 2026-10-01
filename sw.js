const CACHE='rushglow-v2';
self.addEventListener('install',e=>{self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);
 if(e.request.method!=='GET'||u.pathname.startsWith('/api/'))return;
 if(e.request.mode==='navigate'){
   e.respondWith(fetch(e.request).catch(()=>caches.match('/')));
   return;
 }
 e.respondWith(fetch(e.request).then(r=>{if(r.ok){const x=r.clone();caches.open(CACHE).then(c=>c.put(e.request,x))}return r}).catch(()=>caches.match(e.request)));
});