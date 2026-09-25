// Private household data and HTML are never cached by the service worker.
// Intentionally no fetch handler: ALL requests (including Google/Firebase APIs,
// authentication and non-GET requests) go directly through the browser network.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('gaegebu-')).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
