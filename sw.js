const CACHE_NAME = 'rushabh-workday-shell-v5';
const APP_SHELL = [
  './', './connected.html', './connected.css', './index.html', './lite.html', './app.css', './app.js',
  './manifest.webmanifest', './assets/app-icon.svg'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok && ['.js','.css','.svg','.webmanifest'].some(ext => new URL(request.url).pathname.endsWith(ext))) {
      const copy = response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
    }
    return response;
  }).catch(() => request.mode === 'navigate' ? caches.match('./connected.html') : Response.error())));
});
