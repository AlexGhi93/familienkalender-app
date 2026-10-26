// Visuelle Regression für Klassisch (npm run test:visuell): Bildschirmfotos jeder Seite in Hell, Dunkel (System) und Dunkel (gewählt),
// verglichen mit der Basis in tests/visuell/__basis__/ (git-ignoriert, nur auf diesem Rechner). Die Basis entsteht auf einem Stand, der
// als richtig gilt: `npm run test:visuell -- --update-snapshots`. Danach muss jede Änderung an theme.css, die Klassisch nicht ändern
// soll, hier 0 Unterschiede zeigen. Die Fotos hängen von den Schriften und der Kantenglättung des Rechners ab – deshalb keine Basis im Repo.
import { defineConfig, devices } from '@playwright/test';

const PORT = 8142; // eigener Port, damit dieser Lauf neben den End-to-End-Tests (8141) laufen kann

const TELEFON = {
  ...devices['Desktop Chrome'],
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
};

export default defineConfig({
  testDir: 'tests/visuell',
  snapshotPathTemplate: '{testDir}/__basis__/{projectName}/{arg}{ext}',
  fullyParallel: true,
  retries: 0,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
    // 0 Pixel Unterschied: Klassisch muss Pixel für Pixel gleich bleiben. `animations: 'disabled'` hält jede Bewegung am Ende an.
    toHaveScreenshot: { maxDiffPixels: 0, threshold: 0, animations: 'disabled', caret: 'hide', scale: 'device' },
  },
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'de-AT',
    timezoneId: 'Europe/Vienna',
    serviceWorkers: 'block',
    contextOptions: { reducedMotion: 'reduce' },
    trace: 'off',
    screenshot: 'off',
  },
  // Hell; Dunkel über das System (prefers-color-scheme); Dunkel über die Wahl in der App (data-theme="dark", Option `darstellung`)
  projects: [
    { name: 'hell', use: { ...TELEFON, colorScheme: 'light' } },
    { name: 'dunkel', use: { ...TELEFON, colorScheme: 'dark' } },
    { name: 'dunkel-gewaehlt', use: { ...TELEFON, colorScheme: 'light', darstellung: 'dunkel' } },
  ],
  webServer: {
    command: `node tests/server.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: true, // ein zweiter Lauf (z. B. ein Prüfer parallel) nutzt denselben Server; er liefert dasselbe Verzeichnis aus
    timeout: 15_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
