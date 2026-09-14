// Private household data and HTML are never cached by the service worker.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('gaegebu-')).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
