self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
// Admin pages and API responses are never cached. An internet connection is required.

self.addEventListener('push',event=>{event.waitUntil((async()=>{let data={};try{data=event.data.json()}catch{}const kind=data.kind;const phone=/^\d{8,15}$/.test(String(data.phone||''))?String(data.phone):null;
 const body=kind==='order'?'A new order has been received.':kind==='representative'?'A customer needs your help.':kind==='test'?'Background notifications are working.':'A new WhatsApp customer message has arrived.';
 const url=phone?'/whatsapp-inbox.html?phone='+encodeURIComponent(phone):kind==='message'||kind==='representative'?'/whatsapp-inbox.html':'/admin.html';
 await self.registration.showNotification('RushGlow Admin',{body,icon:'/api/admin-app-icon?size=192',badge:'/api/admin-app-icon?size=192',data:{url},tag:phone?'rushglow-'+kind+'-'+phone:'rushglow-'+kind,renotify:true});})());});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const raw=event.notification.data?.url||'/admin.html';const url=new URL(raw,self.location.origin);if(url.origin!==self.location.origin||!['/admin.html','/whatsapp-inbox.html'].includes(url.pathname))return;
 const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});const existing=windows.find(client=>client.url===url.href);if(existing)return existing.focus();return self.clients.openWindow(url.href);})());});
