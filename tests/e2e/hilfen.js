// Gemeinsame Helfer der End-to-End-Tests: feste Uhrzeit, Demo-/Google-Start und eine Wache, die jeden Fehler im Browser meldet.
import { test as basis, expect } from '@playwright/test';

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

/** Geht über die Tab-Leiste auf eine Seite. */
export async function tab(page, name) {
  await page.locator('nav.tabs').getByRole('link', { name }).click();
}

/** Wartet auf eine kurze Meldung unten (Toast) mit diesem Text. */
export async function erwarteToast(page, text) {
  await expect(page.locator('.toast').filter({ hasText: text })).toBeVisible();
}
