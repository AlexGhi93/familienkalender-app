// Gemeinsame Werkzeuge der Mess-Skripte (kontrast.mjs, leistung.mjs, galerie.mjs): eigener Server auf einem eigenen Port, ein
// Browser-Kontext im Telefonformat je Aussehen × Darstellung, die Demo zur festen Uhrzeit. Ohne Playwright-Test-Runner (reine
// Bibliothek), damit die Skripte Zahlen sammeln und berichten können, statt beim ersten Fund abzubrechen.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const WURZEL = fileURLToPath(new URL('../..', import.meta.url));

/** Mittwoch, 14. Oktober 2026, 08:00 in Wien (wie tests/e2e/hilfen.js). */
export const WERKTAG = '2026-10-14T08:00:00+02:00';
export const WERKTAG_DATUM = '2026-10-14';
export const KONFIG_DEMO = { v: 1, modus: 'demo' };

export const AUSSEHEN = ['klassisch', 'glas', 'bento'];
export const MODI = ['hell', 'dunkel'];

/**
 * Startet tests/server.mjs auf `port` als eigenen Kindprozess und wartet, bis er antwortet. `stop()` beendet genau diesen Prozess
 * (nach PID, nie andere Node-Prozesse).
 */
export async function starteServer(port) {
  const kind = spawn(process.execPath, ['tests/server.mjs', String(port)], { cwd: WURZEL, stdio: ['ignore', 'ignore', 'pipe'] });
  let fehler = '';
  kind.stderr.on('data', (d) => (fehler += d));
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i += 1) {
    if (kind.exitCode !== null) throw new Error(`Server beendet (${kind.exitCode}): ${fehler}`);
    try {
      const antwort = await fetch(`${url}/index.html`);
      if (antwort.ok) break;
    } catch {
      // noch nicht bereit
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return {
    url,
    pid: kind.pid,
    stop: () =>
      new Promise((r) => {
        if (kind.exitCode !== null) return r();
        kind.once('exit', () => r());
        kind.kill();
      }),
  };
}

/** Telefon wie in den Tests (390 × 844, Touch); `breite`/`hoehe` für andere Telefone, `dpr` für schärfere Fotos. */
export function telefon({ breite = 390, hoehe = 844, dpr = 2 } = {}) {
  return { viewport: { width: breite, height: hoehe }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true };
}

/**
 * Neuer Kontext: Aussehen (fk.aussehen.v1 vor dem ersten Skript, einmal je Kontext), Darstellung über das System
 * (prefers-color-scheme), Bewegung reduziert (Standard) oder an. Der Service Worker ist gesperrt (jede Seite frisch vom Server).
 */
export async function neuerKontext(browser, { url, aussehen = 'klassisch', modus = 'hell', bewegung = false, geraet = telefon(), ...rest } = {}) {
  const kontext = await browser.newContext({
    ...geraet,
    baseURL: url,
    locale: 'de-AT',
    timezoneId: 'Europe/Vienna',
    colorScheme: modus === 'dunkel' ? 'dark' : 'light',
    reducedMotion: bewegung ? 'no-preference' : 'reduce',
    serviceWorkers: 'block',
    ...rest,
  });
  if (aussehen !== 'klassisch') {
    await kontext.addInitScript((wert) => {
      try {
        if (localStorage.getItem('fk.test.aussehen-vorbelegt')) return;
        localStorage.setItem('fk.test.aussehen-vorbelegt', '1');
        localStorage.setItem('fk.aussehen.v1', wert);
      } catch {
        // Seite ohne Speicher
      }
    }, aussehen);
  }
  return kontext;
}

/** Legt Werte in localStorage, bevor die Seite ihre Skripte ausführt (nur beim ersten Laden). */
export async function speicherVorbelegen(page, werte) {
  await page.addInitScript(
    (eintraege) => {
      if (sessionStorage.getItem('fk.test.vorbelegt')) return;
      sessionStorage.setItem('fk.test.vorbelegt', '1');
      for (const [k, v] of Object.entries(eintraege)) localStorage.setItem(k, v);
    },
    Object.fromEntries(Object.entries(werte).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])),
  );
}

/** Demo zur festen Uhrzeit, Seite `route`; wartet auf die Tab-Leiste. */
export async function starteDemo(page, { route = '#/heute', zeit = WERKTAG, speicher = {} } = {}) {
  await page.clock.setFixedTime(new Date(zeit));
  await speicherVorbelegen(page, { 'fk.config.v1': KONFIG_DEMO, ...speicher });
  await page.goto(`/${route}`);
  await page.locator('nav.tabs').waitFor();
}

/** Wartet auf Schriften und zwei Bilder (alles gezeichnet). */
export async function ruhe(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}
