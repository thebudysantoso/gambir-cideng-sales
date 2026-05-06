const CACHE_NAME = 'gambir-v4';
const urlsToCache = [
  '/',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/visit.html',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('fetch', event => {
  // Cache static assets, network-first for API
  const isApi = event.request.url.includes('/api/');
  if (isApi) {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(event.request).then(r => r || new Response('{"offline":true}', { headers: { 'Content-Type': 'application/json' } }))
      )
    );
  } else {
    event.respondWith(
      caches.match(event.request).then(r => r || fetch(event.request))
    );
  }
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});
