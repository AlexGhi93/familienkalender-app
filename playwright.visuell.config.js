// Visuelle Regression für Klassisch (npm run test:visuell): Bildschirmfotos jeder Seite in Hell, Dunkel (System) und Dunkel (gewählt),
// verglichen mit der Basis in tests/visuell/__basis__/ (git-ignoriert, nur auf diesem Rechner). Die Basis entsteht nie auf dem geprüften
// Stand, sondern in einem git worktree von 097adc4 (vor den Design-Tokens; Ablauf im Kopf von tests/visuell/klassisch.spec.js;
// node_modules dort als Verknüpfung auf die des Repos). Danach muss jede Änderung an theme.css, die Klassisch nicht ändern
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
  outputDir: 'test-results/visuell', // eigener Ordner: ein paralleler e2e-Lauf behält seine Ergebnisse
  fullyParallel: true,
  retries: 0,
  timeout: 30_000,
  expect: {
    timeout: 10_000, // großzügig: läuft oft neben anderen Tests; an den Fotos ändert das nichts
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
    // nie einen fremden Server nutzen (er könnte aus einem anderen Verzeichnis liefern); ist der Port belegt, bricht der Lauf ab
    reuseExistingServer: false,
    timeout: 15_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
