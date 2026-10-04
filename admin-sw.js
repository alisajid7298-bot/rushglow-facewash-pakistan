self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
// Admin pages and API responses are never cached. An internet connection is required.

self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});const admin=windows.find(client=>new URL(client.url).pathname==='/admin.html');if(admin)return admin.focus();return self.clients.openWindow('/admin.html');})());});
