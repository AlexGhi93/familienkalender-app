// Gemeinsame Helfer der End-to-End-Tests: feste Uhrzeit, Demo-/Google-Start (auch mit einer Attrappe von Google) und eine Wache, die jeden Fehler im Browser meldet.
import { test as basis, expect } from '@playwright/test';
import { einkaufZuEreignis } from '../../src/calendar/mapping.js';

/** Mittwoch, 14. Oktober 2026, 08:00 in Wien: ein gewöhnlicher Werktag (kein Feiertag, kein Urlaub in der Demo). */
export const WERKTAG = '2026-10-14T08:00:00+02:00';
export const WERKTAG_DATUM = '2026-10-14';

export const KONFIG_DEMO = { v: 1, modus: 'demo' };
const K = 'x_1@group.calendar.google.com';
export const KONFIG_GOOGLE = { v: 1, modus: 'google', rolle: 'besitzer', kalender: { termine: K, abwesenheit: K, anwesenheit: K } };

/** Meldungen, die bei abgebrochenen Anfragen an Google/den Push-Dienst erwartet sind (nur dort, wo Google ins Spiel kommt). */
export const NETZFEHLER = /Failed to load resource|net::ERR_/;

/**
 * `test` mit Wache: jeder `pageerror` und jedes `console.error` lässt den Test scheitern.
 * Ein Test kann erwartete Meldungen erlauben: `test.use({ erlaubteFehler: /Muster/ })`.
 */
export const test = basis.extend({
  erlaubteFehler: [null, { option: true }],
  fehlerWache: [
    async ({ page, erlaubteFehler }, use) => {
      const fehler = [];
      page.on('pageerror', (e) => fehler.push(`pageerror: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error' && !erlaubteFehler?.test(m.text())) fehler.push(`console.error: ${m.text()}`);
      });
      await use(fehler);
      expect(fehler, 'Fehler im Browser').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Legt Werte in localStorage, bevor die Seite ihre Skripte ausführt (nur beim ersten Laden des Tests, Neuladen behält den Stand). */
async function speicherVorbelegen(page, werte) {
  await page.addInitScript((eintraege) => {
    if (sessionStorage.getItem('fk.test.vorbelegt')) return;
    sessionStorage.setItem('fk.test.vorbelegt', '1');
    for (const [k, v] of Object.entries(eintraege)) localStorage.setItem(k, v);
  }, Object.fromEntries(Object.entries(werte).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])));
}

/** Startet die Demo zur festen Uhrzeit `zeit` und öffnet `route` (z. B. '#/heute'). */
export async function starteDemo(page, { route = '#/heute', zeit = WERKTAG, speicher = {} } = {}) {
  await page.clock.setFixedTime(new Date(zeit));
  await speicherVorbelegen(page, { 'fk.config.v1': KONFIG_DEMO, ...speicher });
  await page.goto(`/${route}`);
  await expect(page.locator('nav.tabs')).toBeVisible();
}

/** Google-Modus ohne Netz: Konfiguration und gespeicherter Stand liegen bereit, alle Anfragen nach außen werden abgebrochen. */
export async function starteGoogleAusSnapshot(page, { route = '#/heute', zeit = WERKTAG } = {}) {
  await page.clock.setFixedTime(new Date(zeit));
  await page.route(/accounts\.google\.com|googleapis\.com|workers\.dev/, (r) => r.abort());
  const snapshot = { v: 1, gespeichertAm: new Date(zeit).toISOString(), settings: {}, tage: {}, urlaub: [], termine: [] };
  await speicherVorbelegen(page, { 'fk.config.v1': KONFIG_GOOGLE, 'fk.snapshot.v1': snapshot });
  await page.goto(`/${route}`);
  await expect(page.locator('nav.tabs')).toBeVisible();
}

/**
 * Attrappe des Google-Anmeldeskripts (accounts.google.com/gsi/client): der Code-Weg für den Login-Dienst (ein Code, den der
 * Dienst eintauscht) und der bisherige Token-Weg (ein Token für eine Stunde, wenn der Dienst nicht erreichbar ist).
 * Jeder Aufruf landet in `window.gisAufrufe`, damit ein Test sehen kann, welcher Weg lief.
 */
const GIS_ATTRAPPE = `
window.gisAufrufe = [];
window.google = { accounts: { oauth2: {
  initTokenClient(c) {
    gisAufrufe.push('initTokenClient');
    return { requestAccessToken() { gisAufrufe.push('requestAccessToken'); setTimeout(() => c.callback({ access_token: 'attrappe-token', expires_in: 3600 }), 0); } };
  },
  initCodeClient(c) {
    gisAufrufe.push('initCodeClient');
    return { requestCode() { gisAufrufe.push('requestCode'); setTimeout(() => c.callback({ code: 'attrappe-code', state: c.state }), 0); } };
  },
} } };`;

/** Sitzung, die die Attrappe des Login-Dienstes vergibt und annimmt (43 Zeichen base64url, wie beim echten Dienst). */
export const ATTRAPPE_SITZUNG = 'attrappe-sitzung-0123456789abcdefghijklmnop';

/**
 * Attrappe des Login-Dienstes (familienkalender-login…workers.dev): `/v1/anmelden` tauscht jeden Code gegen ATTRAPPE_SITZUNG und
 * ein Token für eine Stunde, `/v1/token` gibt für ATTRAPPE_SITZUNG ein frisches Token (sonst 401), `/v1/abmelden` antwortet 204.
 */
async function loginDienstAntwort(route) {
  const anfrage = route.request();
  const antwort = (status, daten) =>
    route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: daten === undefined ? '' : JSON.stringify(daten) });
  const pfad = new URL(anfrage.url()).pathname;
  const body = anfrage.method() === 'POST' ? anfrage.postDataJSON() : null;
  const token = { access_token: 'attrappe-token-dienst', expires_in: 3600 };
  if (pfad === '/v1/anmelden' && typeof body?.code === 'string') return antwort(200, { sitzung: ATTRAPPE_SITZUNG, ...token });
  if (pfad === '/v1/token') return body?.sitzung === ATTRAPPE_SITZUNG ? antwort(200, token) : antwort(401, { fehler: 'sitzung-ungueltig' });
  if (pfad === '/v1/abmelden') return antwort(204);
  return antwort(404, { fehler: 'unbekannt' });
}

/**
 * Google ohne Netz, aber anmeldbar: das Anmeldeskript ist eine Attrappe (siehe oben), die Kalender-API ein kleiner Speicher im Test
 * (Ereignisse nach ID; Listen sind leer). `einkauf` = Einkaufsliste, die schon im Kalender steht.
 * Ergebnis: { anfragen: ['GET /calendars/…/events/fkeinkauf', …], dienste, setzeEinkauf(liste) } – `setzeEinkauf` spielt das andere Telefon.
 * Der Login-Dienst ist eine Attrappe (siehe oben; mit `loginDienst: false` nicht erreichbar), der Push-Dienst ist nicht erreichbar.
 * Alle Anfragen an beide Dienste landen in `dienste`.
 */
export async function googleAttrappe(page, { einkauf = null, loginDienst = true } = {}) {
  const ereignisse = new Map();
  const anfragen = [];
  const dienste = [];
  let etag = 1;
  const merke = (e) => ereignisse.set(e.id, { ...e, status: 'confirmed', etag: `"${(etag += 1)}"` });
  const setzeEinkauf = (liste) => merke(einkaufZuEreignis(liste).body);
  if (einkauf) setzeEinkauf(einkauf);

  await page.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'text/javascript', body: GIS_ATTRAPPE }));
  await page.route(/workers\.dev/, (r) => {
    dienste.push(r.request().url());
    return loginDienst && r.request().url().includes('familienkalender-login') ? loginDienstAntwort(r) : r.abort();
  });
  await page.route(/^https:\/\/www\.googleapis\.com\/calendar\/v3\//, (route) => {
    const anfrage = route.request();
    const methode = anfrage.method();
    const pfad = decodeURIComponent(new URL(anfrage.url()).pathname.replace('/calendar/v3', ''));
    anfragen.push(`${methode} ${pfad}`);
    const antwort = (status, daten) =>
      route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: daten === undefined ? '' : JSON.stringify(daten) });
    const fehlt = () => antwort(404, { error: { code: 404, message: 'Not Found' } });
    const treffer = /^\/calendars\/[^/]+\/events(?:\/([^/]+))?$/.exec(pfad);
    if (!treffer) return antwort(200, { items: [] }); // Kalenderliste u. Ä.
    const id = treffer[1];
    if (methode === 'GET') return id ? (ereignisse.has(id) ? antwort(200, ereignisse.get(id)) : fehlt()) : antwort(200, { items: [] });
    if (methode === 'POST') {
      const body = anfrage.postDataJSON();
      if (ereignisse.has(body.id)) return antwort(409, { error: { code: 409, message: 'The requested identifier already exists.' } });
      merke(body);
      return antwort(200, ereignisse.get(body.id));
    }
    if (methode === 'PATCH') {
      if (!ereignisse.has(id)) return fehlt();
      merke({ ...ereignisse.get(id), ...anfrage.postDataJSON() });
      return antwort(200, ereignisse.get(id));
    }
    if (methode === 'DELETE') return ereignisse.delete(id) ? antwort(204) : fehlt();
    return antwort(405, { error: { code: 405, message: 'Nicht in der Attrappe' } });
  });
  return { anfragen, dienste, setzeEinkauf };
}

/**
 * Google-Modus, angemeldet über die Attrappe (siehe googleAttrappe): erster Start ohne gespeicherten Stand, „Mit Google anmelden“,
 * bis „Verbunden ✓“. Mit `uhrLaeuft` läuft die Uhr ab `zeit` weiter (page.clock.install, für Zeitgeber wie den 30-Sekunden-Abgleich),
 * sonst steht sie. Gibt die Attrappe zurück.
 */
export async function starteGoogleVerbunden(page, { route = '#/heute', zeit = WERKTAG, einkauf = null, uhrLaeuft = false, loginDienst = true } = {}) {
  if (uhrLaeuft) await page.clock.install({ time: new Date(zeit) });
  else await page.clock.setFixedTime(new Date(zeit));
  const google = await googleAttrappe(page, { einkauf, loginDienst });
  await speicherVorbelegen(page, { 'fk.config.v1': KONFIG_GOOGLE });
  await page.goto(`/${route}`);
  await page.getByRole('button', { name: 'Mit Google anmelden' }).click();
  await expect(page.locator('.toast').filter({ hasText: 'Verbunden ✓' })).toBeVisible();
  await expect(page.locator('nav.tabs')).toBeVisible();
  return google;
}

/** Geht über die Tab-Leiste auf eine Seite. */
export async function tab(page, name) {
  await page.locator('nav.tabs').getByRole('link', { name }).click();
}

/** Wartet auf eine kurze Meldung unten (Toast) mit diesem Text. */
export async function erwarteToast(page, text) {
  await expect(page.locator('.toast').filter({ hasText: text })).toBeVisible();
}
