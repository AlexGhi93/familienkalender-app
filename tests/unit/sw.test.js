// Service Worker (sw.js): wird mit node:vm in einem falschen `self` geladen (mit `clients` und `registration` für den Tipp auf eine Erinnerung).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const QUELLE = readFileSync(new URL('../../sw.js', import.meta.url), 'utf8');

const anfrage = (url, methode = 'GET') => ({ url, method: methode });

/** Lädt sw.js; `vorhanden` = URLs, die schon im Zwischenspeicher liegen. `ausloesen(typ, ereignis)` wartet auf waitUntil/respondWith. */
function swLaden({ fetch = async () => new Response('x', { status: 200 }), vorhanden = [], clients = {}, registration = {}, origin = 'https://app.test' } = {}) {
  const eintraege = new Map(vorhanden.map((u) => [u, new Response('alt')]));
  const cache = {
    addAll: async () => {},
    put: async (req, antwort) => void eintraege.set(typeof req === 'string' ? req : req.url, antwort),
    keys: async () => [...eintraege.keys()].map((url) => ({ url })),
    delete: async (req) => eintraege.delete(typeof req === 'string' ? req : req.url),
  };
  const caches = {
    open: async () => cache,
    keys: async () => ['familienkalender-v2'],
    delete: async () => true,
    match: async (req) => eintraege.get(req.url),
  };
  const hoerer = {};
  const self = { location: { origin }, addEventListener: (typ, f) => void (hoerer[typ] = f), clients: { claim: async () => {}, ...clients }, registration, skipWaiting: async () => {} };
  vm.runInNewContext(QUELLE, { self, caches, fetch, URL, Response, console });
  return {
    async ausloesen(typ, ereignis = {}) {
      const wartend = [];
      hoerer[typ]({ ...ereignis, waitUntil: (p) => wartend.push(p), respondWith: (p) => wartend.push(p) });
      await Promise.all(wartend);
    },
    gespeichert: () => [...eintraege.keys()],
  };
}
const mitAnfrage = (url) => ({ request: anfrage(url) });

test('Abruf mit Query (Versionsprüfung) wird nicht in den Zwischenspeicher gelegt', async () => {
  const sw = swLaden();
  await sw.ausloesen('fetch', mitAnfrage('https://app.test/src/app/version.js?1731650000000'));
  assert.deepEqual(sw.gespeichert(), []);
  await sw.ausloesen('fetch', mitAnfrage('https://app.test/src/app/version.js'));
  assert.deepEqual(sw.gespeichert(), ['https://app.test/src/app/version.js']);
});

test('activate räumt alte Einträge mit Query weg, alles andere bleibt', async () => {
  const sw = swLaden({ vorhanden: ['https://app.test/src/app/version.js?1', 'https://app.test/src/app/version.js?2', 'https://app.test/index.html'] });
  await sw.ausloesen('activate');
  assert.deepEqual(sw.gespeichert(), ['https://app.test/index.html']);
});

// ---------- Tipp auf eine Erinnerung (B13) ----------

const klick = (u) => ({ notification: { close() {}, data: u === undefined ? undefined : { u } } });

/** Ein offenes Fenster der App: merkt sich Nachrichten, Fokus und (verbotenes) Neuladen. */
function fensterAttrappe() {
  const fenster = {
    nachrichten: [],
    navigiert: 0,
    fokus: 0,
    focus: async () => ((fenster.fokus += 1), fenster),
    postMessage: (m) => void fenster.nachrichten.push(structuredClone(m)), // Kopie: Objekte aus dem vm-Kontext haben einen anderen Prototyp
    navigate: async () => void (fenster.navigiert += 1),
  };
  return fenster;
}

/** `self.clients` mit den offenen Fenstern; `geoeffnet` sammelt die Adressen von openWindow. */
function klienten(fenster = []) {
  const geoeffnet = [];
  return { geoeffnet, clients: { matchAll: async () => fenster, openWindow: async (adresse) => void geoeffnet.push(String(adresse)) } };
}
const BEREICH = { scope: 'https://app.test/' };

test('Tipp auf eine Erinnerung bei offener App: Nachricht statt Neuladen (B13)', async () => {
  const fenster = fensterAttrappe();
  const k = klienten([fenster]);
  const sw = swLaden({ clients: k.clients, registration: BEREICH });
  await sw.ausloesen('notificationclick', klick('#/autos/abcd1234'));
  assert.deepEqual(fenster.nachrichten, [{ art: 'fk-ziel', u: '#/autos/abcd1234' }]);
  assert.equal(fenster.navigiert, 0);
  assert.equal(fenster.fokus, 1);
  assert.deepEqual(k.geoeffnet, [], 'kein zweites Fenster');
});

test('offene App: nur ein Fenster bekommt das Ziel; scheitert der Fokus, kommt das Ziel trotzdem an', async () => {
  const erstes = fensterAttrappe();
  const zweites = fensterAttrappe();
  erstes.focus = async () => {
    throw new Error('nicht erlaubt');
  };
  const k = klienten([erstes, zweites]);
  const sw = swLaden({ clients: k.clients, registration: BEREICH });
  await sw.ausloesen('notificationclick', klick('#/konto'));
  assert.deepEqual(erstes.nachrichten, [{ art: 'fk-ziel', u: '#/konto' }]);
  assert.deepEqual(zweites.nachrichten, []);
  assert.equal(erstes.navigiert + zweites.navigiert, 0);
  assert.deepEqual(k.geoeffnet, []);
});

test('ohne offenes Fenster: öffnet index.html mit dem Ziel', async () => {
  const { geoeffnet, clients } = klienten();
  const sw = swLaden({ clients, registration: BEREICH });
  await sw.ausloesen('notificationclick', klick('#/konto'));
  assert.equal(geoeffnet[0], 'https://app.test/index.html#/konto');
  assert.equal(geoeffnet.length, 1);
});

test('ohne offenes Fenster, App in einem Unterordner: index.html im Bereich des Service Workers', async () => {
  const { geoeffnet, clients } = klienten();
  const sw = swLaden({ clients, registration: { scope: 'https://seite.test/kalender/' }, origin: 'https://seite.test' });
  await sw.ausloesen('notificationclick', klick('#/autos/abcd1234'));
  assert.deepEqual(geoeffnet, ['https://seite.test/kalender/index.html#/autos/abcd1234']);
});

test('Erinnerung ohne oder mit fremdem Ziel: führt zu Heute (nie zu einer anderen Adresse)', async () => {
  for (const u of [undefined, '', 'https://boese.test/', '//boese.test/', '../anderswo.html', 42]) {
    const { geoeffnet, clients } = klienten();
    await swLaden({ clients, registration: BEREICH }).ausloesen('notificationclick', klick(u));
    assert.deepEqual(geoeffnet, ['https://app.test/index.html#/heute'], String(u));
    const fenster = fensterAttrappe();
    await swLaden({ clients: klienten([fenster]).clients, registration: BEREICH }).ausloesen('notificationclick', klick(u));
    assert.deepEqual(fenster.nachrichten, [{ art: 'fk-ziel', u: '#/heute' }], String(u));
  }
});
