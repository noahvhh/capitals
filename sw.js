/*
 * Offline cache. Everything the app needs is precached on first visit so
 * it works with weak or no Wi-Fi, but requests go to the network first,
 * so a new deploy shows up on the next load. The saved copy is used when
 * offline, or when the network takes more than a few seconds.
 * Bump VERSION when files change.
 */
var VERSION = 'capitals-v7';
var FILES = [
  './', 'index.html', 'css/styles.css',
  'data/countries.js', 'data/countries-es.js', 'data/map.js',
  'js/i18n.js', 'js/storage.js', 'js/sync.js', 'js/quiz.js', 'js/decks/capitals.js', 'js/config.js', 'js/speech.js',
  'js/flag.js', 'js/map.js', 'js/render.js', 'js/ui.js',
  'fonts/instrument-serif-latin-400-normal.woff2', 'fonts/instrument-serif-latin-ext-400-normal.woff2',
  'fonts/twemoji-country-flags.woff2',
  'icons/icon.svg', 'icons/apple-touch-icon.png', 'manifest.webmanifest'
];
var SLOW_MS = 4000;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    var old = keys.filter(function (k) { return k !== VERSION; });
    return Promise.all(old.map(function (k) { return caches.delete(k); })).then(function () { return old.length > 0; });
  }).then(function (upgraded) {
    return self.clients.claim().then(function () {
      if (!upgraded) return;
      // Pages still showing an older version reload onto this one. Older
      // workers served from the cache first, so without this an update
      // only appeared after a second refresh.
      return self.clients.matchAll({ type: 'window' }).then(function (wins) {
        wins.forEach(function (w) {
          if (w.navigate) w.navigate(w.url).catch(function () {});
        });
      });
    });
  }));
});

function fromCache(req) {
  return caches.match(req, { ignoreSearch: true });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  var url = new URL(req.url);
  // Sync calls always go straight to the server.
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.indexOf('/api/') === 0) return;
  // no-cache: always check with the server (a 304 when nothing changed),
  // so the browser's own HTTP cache can't hold back an update either.
  var net = fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(function (res) {
    if (res.ok) {
      var copy = res.clone();
      caches.open(VERSION).then(function (c) { return c.put(req, copy); });
    }
    // A page load can't be answered with a redirected response.
    if (res.redirected && req.mode === 'navigate') {
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
    }
    return res;
  });
  var slow = new Promise(function (resolve) {
    setTimeout(function () { fromCache(req).then(function (hit) { if (hit) resolve(hit); }); }, SLOW_MS);
  });
  e.respondWith(Promise.race([net, slow]).catch(function () {
    return fromCache(req).then(function (hit) { return hit || Response.error(); });
  }));
});
