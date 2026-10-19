/*
 * Offline cache. Everything the app needs is precached on first visit, so
 * later visits work with weak or no Wi-Fi. Bump VERSION when files change.
 */
var VERSION = 'capitals-v1';
var FILES = [
  './', 'index.html', 'css/styles.css',
  'data/countries.js', 'data/map.js',
  'js/storage.js', 'js/quiz.js', 'js/decks/capitals.js', 'js/config.js', 'js/speech.js',
  'js/flag.js', 'js/map.js', 'js/render.js', 'js/shader.js', 'js/ui.js',
  'fonts/instrument-serif-latin-400-normal.woff2', 'fonts/instrument-serif-latin-ext-400-normal.woff2',
  'icons/icon.svg', 'icons/apple-touch-icon.png', 'manifest.webmanifest'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// Cache first, then network; refresh the cache in the background.
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(function (cache) {
    return cache.match(e.request, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(e.request).then(function (res) {
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    });
  }));
});
