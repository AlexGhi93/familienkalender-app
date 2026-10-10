// „Konto & App“ in der Demo: Karten, Darstellung (Hell/Dunkel), Sicherung als Datei, Demo zurücksetzen, Version, Weg zu Google.
import { readFile } from 'node:fs/promises';
import { test, expect, starteDemo, erwarteToast } from './hilfen.js';
import { VERSION } from '../../src/app/version.js';

const karten = (page) => page.locator('section.screen > article.karte > h3');

test('Karten in der Demo und Version', async ({ page }) => {
  await starteDemo(page, { route: '#/app' });
  await expect(page.getByRole('heading', { name: 'Konto & App 👤' })).toBeVisible();
  await expect(karten(page)).toHaveText(['Mit Google verbinden', 'Darstellung', 'Sicherung', 'Demo-Modus']);
  await expect(page.locator('.push-person')).toHaveCount(0); // „Dieses Telefon gehört“ gibt es nur mit Google (Push-Erinnerungen)
  await expect(page.locator('p.version')).toHaveText(`Familienkalender ${VERSION}`);
  await expect(page.locator('p.version')).toHaveText(/^Familienkalender \d+\.\d+\.\d+$/);
});

test('Darstellung: Dunkel, Hell, Automatisch – mit data-theme, theme-color und nach dem Neuladen', async ({ page }) => {
  await starteDemo(page, { route: '#/app' });
  const html = page.locator('html');
  const karte = page.locator('article.karte').filter({ has: page.getByRole('heading', { name: 'Darstellung' }) });
  const farben = () => page.locator('meta[name="theme-color"]').evaluateAll((m) => m.map((x) => [x.content, x.media || null]));
  // wirksam ist das erste theme-color-Meta, dessen media passt (oder das keins hat)
  const wirksameFarbe = () => page.evaluate(() => [...document.querySelectorAll('meta[name="theme-color"]')].find((m) => !m.media || matchMedia(m.media).matches)?.content);
  await expect(karte.locator('.chip')).toHaveText(['Automatisch', '☀️ Hell', '🌙 Dunkel']);
  await expect(karte.locator('.chip.aktiv')).toHaveText('Automatisch');
  await expect(html).not.toHaveAttribute('data-theme');

  await karte.getByRole('button', { name: '🌙 Dunkel' }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(karte.locator('.chip.aktiv')).toHaveText('🌙 Dunkel');
  expect(await farben()).toEqual([['#1F1B2E', null]]);
  expect(await page.evaluate(() => localStorage.getItem('fk.darstellung.v1'))).toBe('dunkel');
  const hintergrund = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark'); // theme-init.js setzt es vor dem ersten Zeichnen
  // theme-init.js läuft vor den beiden Metas im HTML: sein Meta steht zuerst und gilt
  expect(await wirksameFarbe()).toBe('#1F1B2E');

  await karte.getByRole('button', { name: '☀️ Hell' }).click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe(hintergrund);

  await karte.getByRole('button', { name: 'Automatisch' }).click();
  await expect(html).not.toHaveAttribute('data-theme');
  expect(await farben()).toEqual([['#FFF7EC', '(prefers-color-scheme: light)'], ['#1F1B2E', '(prefers-color-scheme: dark)']]);
  expect(await wirksameFarbe()).toBe('#FFF7EC'); // das Telefon (hier) ist hell
  expect(await page.evaluate(() => localStorage.getItem('fk.darstellung.v1'))).toBeNull();
});

test('Sicherung: vorbereiten zeigt „Bereit“, Datei speichern lädt das JSON herunter', async ({ page }) => {
  await starteDemo(page, { route: '#/app' });
  const karte = page.locator('article.karte').filter({ has: page.getByRole('heading', { name: 'Sicherung' }) });
  await karte.getByRole('button', { name: 'Sicherung vorbereiten' }).click();
  await expect(karte.locator('.sichern-bereit p')).toHaveText(/^Bereit: \d+ Tage · 2 Urlaube · 8 Termine · 4 Artikel auf der Einkaufsliste · 10 Kontostände\.$/);
  const speichern = karte.getByRole('button', { name: 'Datei speichern (familienkalender-sicherung-2026-10-14.json)' });
  const [download] = await Promise.all([page.waitForEvent('download'), speichern.click()]);
  expect(download.suggestedFilename()).toBe('familienkalender-sicherung-2026-10-14.json');
  const sicherung = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(sicherung).toMatchObject({ app: 'familienkalender', sicherungVersion: 1, appVersion: VERSION, erstelltAm: '2026-10-14T06:00:00.000Z' });
  expect(sicherung.termine.find((t) => t.id === 'demo-t1').titel).toBe('🩺 Kinderarzt (Kind) 10:00 · 🎒 e-card, MuKi-Pass, Impfpass');
  // „Bereit“ übersteht das Neuzeichnen der Seite
  await page.getByRole('button', { name: '‹ Zurück' }).click();
  await page.locator('.menue-eintrag[data-id="app"] .menue-zeile').click();
  await expect(page.locator('.sichern-bereit')).toBeVisible();
});

test('Demo zurücksetzen fragt nach und bringt die Beispieldaten zurück', async ({ page }) => {
  await starteDemo(page, { route: '#/einkauf' });
  await page.getByRole('button', { name: 'Milch löschen' }).click();
  await page.goto('/#/app');
  await page.getByRole('button', { name: 'Demo zurücksetzen' }).click();
  const frage = page.getByRole('dialog', { name: 'Demo zurücksetzen?' });
  await expect(frage).toContainText('Alle Änderungen in der Demo gehen verloren');
  await frage.getByRole('button', { name: 'Zurücksetzen' }).click();
  await erwarteToast(page, 'Demo zurückgesetzt');
  await page.goto('/#/einkauf');
  await expect(page.locator('.ek-name', { hasText: /^Milch$/ })).toBeVisible();
});

test('„Mit Google einrichten“ führt zum Willkommen; die Demo bleibt erhalten', async ({ page }) => {
  await starteDemo(page, { route: '#/app' });
  await page.getByRole('button', { name: 'Mit Google einrichten' }).click();
  await expect(page.getByRole('heading', { name: 'Willkommen beim Familienkalender' })).toBeVisible();
  await expect(page.locator('.willkommen-knopf').nth(2)).toContainText('Demo weiter ansehen');
  expect(await page.evaluate(() => localStorage.getItem('fk.config.v1'))).toBeNull();
  await page.getByRole('button', { name: /Demo weiter ansehen/ }).click();
  await expect(page.locator('nav.tabs')).toBeVisible();
});
