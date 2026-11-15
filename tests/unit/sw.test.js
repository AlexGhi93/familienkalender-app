// Service Worker (sw.js): wird mit node:vm in einem falschen `self` geladen. T10 erweitert die Attrappe (clients, registration).
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
