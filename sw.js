// Service Worker: immer zuerst das Netz fragen (so ist nach einem Update sofort die neue Version da)
// und nur offline auf den Zwischenspeicher zurückgreifen.
const CACHE = 'familienkalender-v2';

// Die Schriften der Aussehen (Glas: Onest, Bento: Fredoka + Nunito, zusammen ≈ 90 KB) liegen gleich nach der Anmeldung im
// Zwischenspeicher – auch die eines Aussehens, das noch nie gewählt wurde: wer es offline zum ersten Mal wählt, sieht seine Schrift.
// Abrufe danach laufen weiter zuerst übers Netz (siehe fetch). Fehlt das Netz beim Anmelden, kommen sie wie bisher beim ersten Gebrauch.
const SCHRIFTEN = ['./fonts/onest.woff2', './fonts/fredoka.woff2', './fonts/nunito.woff2'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        await (await caches.open(CACHE)).addAll(SCHRIFTEN);
      } catch {
        // offline beim Anmelden: kein Hindernis, die Schriften kommen beim ersten Gebrauch in den Zwischenspeicher
      }
      await self.skipWaiting();
    })(),
  );
});

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

// Push-Erinnerungen der App (verschlüsselt vom Push-Dienst, hier schon entschlüsselt vom Browser): {"t": Titel, "k": Text, "g": Kennung, "u": Ziel}.
// Jeder Push zeigt IMMER eine Benachrichtigung; iOS entzieht sonst das Abonnement.
self.addEventListener('push', (event) => {
  let daten = {};
  try {
    daten = event.data ? event.data.json() : {};
  } catch {
    // unlesbar: trotzdem etwas anzeigen
  }
  const titel = typeof daten.t === 'string' && daten.t !== '' ? daten.t : 'Erinnerung';
  const ziel = typeof daten.u === 'string' && daten.u.startsWith('#/') ? daten.u : '#/heute';
  const optionen = {
    body: typeof daten.k === 'string' ? daten.k : 'Familienkalender',
    tag: typeof daten.g === 'string' ? daten.g : undefined, // gleiche Kennung ersetzt eine Doppelung
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { u: ziel },
  };
  event.waitUntil(self.registration.showNotification(titel, optionen));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const ziel = new URL(event.notification.data?.u ?? '#/heute', self.registration.scope).href;
  event.waitUntil(
    (async () => {
      const fenster = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const f of fenster) {
        if ('focus' in f) {
          await f.focus();
          if ('navigate' in f) await f.navigate(ziel).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(ziel);
    })(),
  );
});
