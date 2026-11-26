'use strict';
const scope=self.registration.scope;
const prefix='forecourt-shell:'+scope+':';
const cacheName=prefix+'station-admin-4';
const index=new URL('index.html',scope).href;
const scripts=['device-store.js','app.js','staff.js'];
const paths=new Set(scripts.map(name=>new URL(name,scope).pathname));
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const response=await fetch(index,{cache:'reload'});
    if(!response.ok)throw Error('Dashboard unavailable');
    const html=await response.clone().text();
    const sources=Array.from(html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gi),match=>new URL(match[1],scope));
    const assets=sources.filter(url=>url.origin===self.location.origin&&paths.has(url.pathname));
    if(new Set(assets.map(url=>url.pathname)).size!==scripts.length)throw Error('Incomplete station dashboard');
    const cache=await caches.open(cacheName);
    await cache.addAll(assets.map(url=>new Request(url.href,{cache:'reload'})));
    await cache.put(index,response);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith(prefix)&&k!==cacheName).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  if(request.mode==='navigate'&&(url.pathname===new URL(scope).pathname||url.pathname===new URL(index).pathname)){
    event.respondWith((async()=>{
      try{const live=await fetch(request);if(live.ok)return live;}catch{}
      return (await (await caches.open(cacheName)).match(index))||Response.error();
    })());
  }else if(paths.has(url.pathname)){
    event.respondWith((async()=>{
      const cached=await (await caches.open(cacheName)).match(request);
      return cached||fetch(request);
    })());
  }
});