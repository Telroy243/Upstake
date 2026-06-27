const CACHE_NAME = 'upstake-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/src/style.css',
  '/src/app.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', event => {
  // Only cache GET requests
  if (event.request.method !== 'GET') return;
  
  // Don't intercept API calls
  if (event.request.url.includes('generativelanguage.googleapis.com')) {
      return;
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
