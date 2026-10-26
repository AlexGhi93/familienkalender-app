// End-to-End-Tests (Playwright): Chromium im Telefonformat, ein Projekt je Aussehen (Klassisch, Glas, Bento). Der Server ist tests/server.mjs (ohne Abhängigkeiten).
import { defineConfig, devices } from '@playwright/test';

// Ohne diesen Schalter wirkt `context.setOffline(true)` in Playwright 1.56 nicht auf die Anfragen, die der Service Worker selbst stellt –
// der Offline-Test in aussehen.spec.js könnte dann nicht zwischen Zwischenspeicher und Netz unterscheiden. Alle anderen Tests laufen mit
// `serviceWorkers: 'block'`, für sie ändert sich nichts. Gilt auch auf dem CI-Server (die Worker erben die Umgebung).
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS ??= '1';

// Safari/WebKit (nur lokal, nicht auf dem CI-Server): `npm run test:webkit` oder `npx playwright test --project=webkit-glas`.
// Die WebKit-Projekte gibt es nur, wenn eines davon verlangt ist (oder PW_WEBKIT=1); der Merker geht über die Umgebung an die Worker.
// Einmalig nötig: `npx playwright install webkit`.
if (process.argv.some((a) => /webkit/.test(a) && /project/.test(a)) || process.argv.some((a, i) => /^--project$/.test(process.argv[i - 1] ?? '') && /webkit/.test(a))) process.env.PW_WEBKIT = '1';
const MIT_WEBKIT = process.env.PW_WEBKIT === '1';

const PORT = Number(process.env.PW_PORT) || 8141; // PW_PORT: eigener Port für parallele Läufe (z. B. in einem git worktree)
const CI = Boolean(process.env.CI);
/** Chromium im Telefonformat; `reducedMotion` kommt für alle Projekte aus `use.contextOptions` unten. */
const TELEFON = {
  ...devices['Desktop Chrome'],
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  hasTouch: true,
  isMobile: true,
};
/** WebKit als iPhone 17 Pro (402 × 874 CSS-px, Safari-PWA ohne Leisten): Glas und Bento über die Hauptbildschirme. */
const IPHONE = { ...devices['iPhone 15 Pro'], viewport: { width: 402, height: 874 }, screen: { width: 402, height: 874 }, deviceScaleFactor: 3 };
const WEBKIT_DATEIEN = /(aussehen-[a-z]+|heute|monat|schichtplan-glas-bento|konto-bewegung|mehr)\.spec\.js$/;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'de-AT',
    timezoneId: 'Europe/Vienna',
    serviceWorkers: 'block', // jeder Test startet ohne Zwischenspeicher des Service Workers
    // Ohne Übergänge und Animationen muss kein Test auf Bewegung warten; die Animationen in „Mehr“ prüft mehr.spec.js ausdrücklich.
    // Achtung: `reducedMotion` wirkt nur über `contextOptions`, nicht als eigene Option unter `use`.
    contextOptions: { reducedMotion: 'reduce' },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // Dieselbe Suite in jedem Aussehen: Klassisch (wie bisher, ohne Wahl), Glas & Licht und Bento bunt (Option `aussehen` aus
  // tests/e2e/hilfen.js legt fk.aussehen.v1 vor dem Laden ab). aussehen.spec.js prüft die Wahl selbst und läuft nur in Klassisch.
  projects: [
    { name: 'telefon-chromium', use: { ...TELEFON } },
    { name: 'telefon-glas', use: { ...TELEFON, aussehen: 'glas' }, testIgnore: /aussehen\.spec\.js$/ },
    { name: 'telefon-bento', use: { ...TELEFON, aussehen: 'bento' }, testIgnore: /aussehen\.spec\.js$/ },
    ...(MIT_WEBKIT
      ? [
          { name: 'webkit-glas', use: { ...IPHONE, aussehen: 'glas' }, testMatch: WEBKIT_DATEIEN, testIgnore: /aussehen\.spec\.js$/ },
          { name: 'webkit-bento', use: { ...IPHONE, aussehen: 'bento' }, testMatch: WEBKIT_DATEIEN, testIgnore: /aussehen\.spec\.js$/ },
        ]
      : []),
  ],
  webServer: {
    command: `node tests/server.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !CI,
    timeout: 15_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
