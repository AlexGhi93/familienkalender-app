// Service Worker: immer zuerst das Netz fragen (so ist nach einem Update sofort die neue Version da)
// und nur offline auf den Zwischenspeicher zurückgreifen.
const CACHE = 'familienkalender-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name !== CACHE) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      try {
        const antwort = await fetch(request, { cache: 'no-cache' });
        if (antwort.ok) (await caches.open(CACHE)).put(request, antwort.clone());
        return antwort;
      } catch (fehler) {
        const gespeichert = await caches.match(request);
        if (gespeichert) return gespeichert;
        throw fehler;
      }
    })(),
  );
});
