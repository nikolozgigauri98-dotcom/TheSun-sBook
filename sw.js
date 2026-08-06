/* ============================================================================
   The Sun's Book — service worker
   © 2026 Nikoloz Gigauri · All rights reserved.

   Its only job is to make the app installable and to survive a lost
   connection. It is deliberately NOT aggressive about caching:

     · pages  -> NETWORK FIRST. A fresh deploy is always what you get.
                 The cache is only reached for if the network fails.
     · icons  -> cache first (they never change under the same filename)
     · rest   -> straight to the network, untouched

   Anything cross-origin (Firebase, Firestore, Google Fonts, CDNs) is left
   completely alone, so sign-in and the chart library keep working normally.
   ============================================================================ */

var SW_VERSION = 'sb-v1';
var PAGE_CACHE = SW_VERSION + '-pages';
var ASSET_CACHE = SW_VERSION + '-assets';

/* The shell we want available if the person opens the app offline. */
var PRECACHE = [
  '/',
  '/img/icon-192.png',
  '/img/icon-512.png'
];

self.addEventListener('install', function (e) {
  /* a new worker takes over straight away — no "close all tabs" dance */
  self.skipWaiting();
  e.waitUntil(
    caches.open(ASSET_CACHE).then(function (c) {
      /* never let one missing file abort the whole install */
      return Promise.all(PRECACHE.map(function (u) {
        return c.add(u).catch(function () { return null; });
      }));
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k.indexOf(SW_VERSION) !== 0) return caches.delete(k);
        return null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* A fetch handler is required for installability — and this one is also
   what keeps the app usable with no signal. */
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  /* leave every other origin untouched: Firebase, Firestore, fonts, CDNs */
  if (url.origin !== self.location.origin) return;

  /* ---- pages: network first, cache only as the fallback ---- */
  if (req.mode === 'navigate' ||
      (req.headers.get('accept') || '').indexOf('text/html') >= 0) {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(PAGE_CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match('/');
        });
      })
    );
    return;
  }

  /* ---- icons: cache first, they are immutable per filename ---- */
  if (url.pathname.indexOf('/img/') === 0) {
    e.respondWith(
      caches.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          var copy = res.clone();
          caches.open(ASSET_CACHE).then(function (c) { c.put(req, copy); });
          return res;
        });
      })
    );
    return;
  }

  /* everything else: normal network behaviour */
});
