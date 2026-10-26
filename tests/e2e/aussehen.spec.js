// Aussehen (Klassisch, Glas & Licht, Bento bunt) und Bewegung (An, Reduziert) in „Konto & App → Darstellung“: sofort wirksam, nach dem
// Neuladen noch da (theme-init.js setzt es vor dem ersten Zeichnen), mit offenem Blatt ohne Schaden, kaputte Werte → Klassisch, offline
// aus dem Zwischenspeicher. Läuft nur im Projekt „telefon-chromium“ (Klassisch); die anderen Projekte starten schon mit einem Aussehen.
import { test, expect, starteDemo } from './hilfen.js';

const karte = (page) => page.locator('article.karte').filter({ has: page.getByRole('heading', { name: 'Darstellung', exact: true }) });
const gruppe = (page, name) => karte(page).getByRole('group', { name, exact: true });
const html = (page) => page.locator('html');
const gespeichert = (page, k) => page.evaluate((s) => localStorage.getItem(s), k);
const farben = (page) => page.locator('meta[name="theme-color"]').evaluateAll((m) => m.map((x) => [x.content, x.media || null]));
// wirksam ist das erste theme-color-Meta, dessen media passt (oder das keins hat)
const wirksameFarbe = (page) => page.evaluate(() => [...document.querySelectorAll('meta[name="theme-color"]')].find((m) => !m.media || matchMedia(m.media).matches)?.content);

test('Darstellung-Karte: Aussehen und Bewegung unter Hell/Dunkel, ohne Wahl kein Attribut', async ({ page }) => {
  await starteDemo(page, { route: '#/app' });
  await expect(gruppe(page, 'Hell oder Dunkel').locator('.chip')).toHaveText(['Automatisch', '☀️ Hell', '🌙 Dunkel']);
  await expect(gruppe(page, 'Aussehen').locator('.chip')).toHaveText(['Klassisch', 'Glas & Licht', 'Bento bunt']);
  await expect(gruppe(page, 'Bewegung').locator('.chip')).toHaveText(['An', 'Reduziert']);
  await expect(gruppe(page, 'Aussehen').locator('.chip.aktiv')).toHaveText('Klassisch');
  await expect(gruppe(page, 'Bewegung').locator('.chip.aktiv')).toHaveText('An');
  // jede Wahl mit einer kleinen Vorschau aus drei Farbtupfen, die der Bildschirmleser überspringt
  for (const chip of await gruppe(page, 'Aussehen').locator('.chip').all()) {
    await expect(chip.locator('.aussehen-vorschau[aria-hidden="true"] .aussehen-pille')).toHaveCount(3);
  }
  await expect(karte(page)).toContainText('Die Wahl gilt nur für dieses Telefon.');
  // Reihenfolge: Hell/Dunkel, dann Aussehen, dann Bewegung
  expect(await karte(page).getByRole('group').evaluateAll((g) => g.map((x) => x.getAttribute('aria-label')))).toEqual(['Hell oder Dunkel', 'Aussehen', 'Bewegung']);
  await expect(html(page)).not.toHaveAttribute('data-aussehen');
  await expect(html(page)).not.toHaveAttribute('data-bewegung');
  expect(await farben(page)).toEqual([['#FFF7EC', '(prefers-color-scheme: light)'], ['#1F1B2E', '(prefers-color-scheme: dark)']]);
});

test('Aussehen: Glas & Licht, Bento bunt, zurück zu Klassisch – sofort und nach dem Neuladen', async ({ page }) => {
  await starteDemo(page, { route: '#/app' });
  const aussehen = gruppe(page, 'Aussehen');

  await aussehen.getByRole('button', { name: 'Glas & Licht' }).click();
  await expect(html(page)).toHaveAttribute('data-aussehen', 'glas');
  await expect(aussehen.locator('.chip.aktiv')).toHaveText('Glas & Licht');
  expect(await gespeichert(page, 'fk.aussehen.v1')).toBe('glas');
  expect(await farben(page)).toEqual([['#F1EEFA', '(prefers-color-scheme: light)'], ['#0D0B19', '(prefers-color-scheme: dark)']]);
  await page.reload();
  await expect(html(page)).toHaveAttribute('data-aussehen', 'glas');
  expect(await wirksameFarbe(page)).toBe('#F1EEFA');
  await expect(aussehen.locator('.chip.aktiv')).toHaveText('Glas & Licht');

  await aussehen.getByRole('button', { name: 'Bento bunt' }).click();
  await expect(html(page)).toHaveAttribute('data-aussehen', 'bento');
  expect(await gespeichert(page, 'fk.aussehen.v1')).toBe('bento');
  await page.reload();
  await expect(html(page)).toHaveAttribute('data-aussehen', 'bento');
  expect(await wirksameFarbe(page)).toBe('#F1EFFA');

  // mit Dunkel zusammen: die Farbe der Leiste passt zu beiden
  await gruppe(page, 'Hell oder Dunkel').getByRole('button', { name: '🌙 Dunkel' }).click();
  expect(await farben(page)).toEqual([['#14111D', null]]);
  await page.reload();
  expect(await wirksameFarbe(page)).toBe('#14111D');
  await gruppe(page, 'Hell oder Dunkel').getByRole('button', { name: 'Automatisch' }).click();

  await aussehen.getByRole('button', { name: 'Klassisch' }).click();
  await expect(html(page)).not.toHaveAttribute('data-aussehen');
  expect(await gespeichert(page, 'fk.aussehen.v1')).toBeNull();
  expect(await farben(page)).toEqual([['#FFF7EC', '(prefers-color-scheme: light)'], ['#1F1B2E', '(prefers-color-scheme: dark)']]);
  await page.reload();
  await expect(html(page)).not.toHaveAttribute('data-aussehen');
  await expect(aussehen.locator('.chip.aktiv')).toHaveText('Klassisch');
});

test('Bewegung: Reduziert setzt data-bewegung, auch nach dem Neuladen; An entfernt es', async ({ page }) => {
  await starteDemo(page, { route: '#/app' });
  const bewegung = gruppe(page, 'Bewegung');
  const vorher = await farben(page);
  await bewegung.getByRole('button', { name: 'Reduziert' }).click();
  await expect(html(page)).toHaveAttribute('data-bewegung', 'reduziert');
  await expect(bewegung.locator('.chip.aktiv')).toHaveText('Reduziert');
  expect(await gespeichert(page, 'fk.bewegung.v1')).toBe('reduziert');
  expect(await farben(page)).toEqual(vorher);
  await page.reload();
  await expect(html(page)).toHaveAttribute('data-bewegung', 'reduziert');
  await bewegung.getByRole('button', { name: 'An' }).click();
  await expect(html(page)).not.toHaveAttribute('data-bewegung');
  expect(await gespeichert(page, 'fk.bewegung.v1')).toBeNull();
  await page.reload();
  await expect(html(page)).not.toHaveAttribute('data-bewegung');
});

test('Wechsel bei offenem Blatt: das Blatt bleibt offen und bedienbar, kein Fehler', async ({ page }) => {
  await starteDemo(page, { route: '#/app' });
  await page.getByRole('button', { name: 'Demo zurücksetzen' }).click();
  const blatt = page.getByRole('dialog', { name: 'Demo zurücksetzen?' });
  await expect(blatt).toBeVisible();
  // wie ein Wechsel aus einem anderen Teil der App: dasselbe Modul, das auch die Karte benutzt
  for (const [aussehen, bewegung] of [['glas', 'reduziert'], ['bento', 'an'], ['klassisch', 'an']]) {
    await page.evaluate(
      async ([a, b]) => {
        const m = await import('/src/ui/darstellung.js');
        m.wendeAussehenAn(a);
        m.wendeBewegungAn(b);
      },
      [aussehen, bewegung],
    );
    if (aussehen === 'klassisch') await expect(html(page)).not.toHaveAttribute('data-aussehen');
    else await expect(html(page)).toHaveAttribute('data-aussehen', aussehen);
    await expect(blatt).toBeVisible();
  }
  await blatt.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(blatt).toHaveCount(0);
  await expect(gruppe(page, 'Aussehen').getByRole('button', { name: 'Glas & Licht' })).toBeEnabled();
});

test('kaputte Werte im Speicher → Klassisch und Bewegung an', async ({ page }) => {
  await starteDemo(page, { route: '#/app', speicher: { 'fk.aussehen.v1': 'xyz', 'fk.bewegung.v1': 'xyz' } });
  await expect(html(page)).not.toHaveAttribute('data-aussehen');
  await expect(html(page)).not.toHaveAttribute('data-bewegung');
  await expect(gruppe(page, 'Aussehen').locator('.chip.aktiv')).toHaveText('Klassisch');
  await expect(gruppe(page, 'Bewegung').locator('.chip.aktiv')).toHaveText('An');
  expect(await farben(page)).toEqual([['#FFF7EC', '(prefers-color-scheme: light)'], ['#1F1B2E', '(prefers-color-scheme: dark)']]);
  await gruppe(page, 'Aussehen').getByRole('button', { name: 'Bento bunt' }).click();
  await expect(html(page)).toHaveAttribute('data-aussehen', 'bento');
});

test.describe('offline', () => {
  // Der Service Worker meldet sich nur über https oder „localhost“ an (src/main.js), deshalb hier localhost statt 127.0.0.1.
  test.use({ serviceWorkers: 'allow', baseURL: async ({ baseURL }, use) => use(baseURL.replace('127.0.0.1', 'localhost')) });

  test('nach einer Ladung mit Service Worker: Aussehen bleibt, themes/glas.css kommt aus dem Zwischenspeicher', async ({ page, context }) => {
    await starteDemo(page, { route: '#/app', speicher: { 'fk.aussehen.v1': 'glas' } });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await page.reload(); // jetzt laufen alle Dateien durch den Service Worker und landen im Zwischenspeicher
    await expect(page.locator('nav.tabs')).toBeVisible();

    await context.setOffline(true);
    const css = page.waitForResponse((r) => r.url().endsWith('/themes/glas.css'));
    await page.reload();
    const antwort = await css;
    expect(antwort.ok()).toBe(true);
    expect(antwort.fromServiceWorker()).toBe(true);
    await expect(page.locator('nav.tabs')).toBeVisible();
    await expect(html(page)).toHaveAttribute('data-aussehen', 'glas');
    await expect(gruppe(page, 'Aussehen').locator('.chip.aktiv')).toHaveText('Glas & Licht');
    await context.setOffline(false);
  });
});
