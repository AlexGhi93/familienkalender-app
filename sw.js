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
      // Abrufe mit Query (z. B. die Versionsprüfung) werden nicht mehr gespeichert; alte Einträge räumen wir weg.
      const cache = await caches.open(CACHE);
      for (const eintrag of await cache.keys()) {
        if (new URL(eintrag.url).search !== '') await cache.delete(eintrag);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const adresse = new URL(request.url);
  if (request.method !== 'GET' || adresse.origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      try {
        const antwort = await fetch(request, { cache: 'no-cache' });
        if (antwort.ok && adresse.search === '') (await caches.open(CACHE)).put(request, antwort.clone());
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

// Tipp auf eine Erinnerung. Ist die App offen, bekommt sie das Ziel als Nachricht und wechselt selbst dorthin (src/main.js) – kein
// `navigate`: die App läuft unter …/index.html, ein anderer Pfad lüde sie neu und noch nicht Gespeichertes ginge verloren. Ist sie zu,
// wird index.html mit dem Ziel geöffnet (dieselbe Adresse wie `start_url`, also auch offline im Zwischenspeicher).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const u = event.notification.data?.u;
  const ziel = typeof u === 'string' && u.startsWith('#/') ? u : '#/heute';
  event.waitUntil(
    (async () => {
      const fenster = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const f of fenster) {
        if ('focus' in f) {
          try {
            await f.focus();
          } catch {
            // nicht nach vorn geholt: das Ziel kommt trotzdem an
          }
          f.postMessage({ art: 'fk-ziel', u: ziel });
          return;
        }
      }
      await self.clients.openWindow(new URL(`index.html${ziel}`, self.registration.scope).href);
    })(),
  );
});
