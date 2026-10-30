// Handle clicks before Firebase imports; the SDK may install its own click handler.
self.addEventListener('notificationclick', event => { event.notification.close(); const target = event.notification.data && event.notification.data.url || './connected.html'; event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => { for (const client of list) if (client.url.startsWith(self.location.origin) && 'focus' in client) { client.navigate(target); return client.focus(); } return clients.openWindow(target); })); });
// The Firebase config contains only public web identifiers. No service-account keys belong in this worker.
try {
  importScripts('./push-config.js');
  if (self.RUSHHABH_FIREBASE_CONFIG && self.RUSHHABH_FIREBASE_CONFIG.projectId) {
    importScripts('https://www.gstatic.com/firebasejs/13.0.0/firebase-app-compat.js', 'https://www.gstatic.com/firebasejs/13.0.0/firebase-messaging-compat.js');
    firebase.initializeApp(self.RUSHHABH_FIREBASE_CONFIG);
    // Initializing the SDK lets it display notification payloads in the background.
    firebase.messaging();
  }
} catch (error) { console.warn('Workday push setup is not configured yet.', error); }
const CACHE_NAME = 'rushabh-workday-shell-v7';
const APP_SHELL = [
  './', './connected.html', './connected.css', './index.html', './lite.html', './app.css', './app.js',
  './manifest.webmanifest', './assets/app-icon.svg', './push.html', './push-config.js'
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
