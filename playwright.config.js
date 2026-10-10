// End-to-End-Tests (Playwright): ein Projekt, Chromium im Telefonformat. Der Server ist tests/server.mjs (ohne Abhängigkeiten).
import { defineConfig, devices } from '@playwright/test';

const PORT = 8141;
const CI = Boolean(process.env.CI);

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
  projects: [
    {
      name: 'telefon-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        hasTouch: true,
        isMobile: true,
      },
    },
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
