// Erster Start ohne Einrichtung: das Willkommen-Menü mit drei Wegen.
import { test, expect, NETZFEHLER, WERKTAG } from './hilfen.js';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(WERKTAG));
});

test('ohne Konfiguration erscheint Willkommen mit drei Wahlmöglichkeiten', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Willkommen beim Familienkalender' })).toBeVisible();
  const knoepfe = page.locator('.willkommen-knopf');
  await expect(knoepfe).toHaveCount(3);
  await expect(knoepfe.nth(0)).toContainText('Neu einrichten');
  await expect(knoepfe.nth(1)).toContainText('Ich habe einen Code');
  await expect(knoepfe.nth(2)).toContainText('Demo ausprobieren');
  await expect(page.locator('nav.tabs')).toHaveCount(0);
});

test('„Demo ausprobieren“ startet die Demo und merkt sich die Wahl', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Demo ausprobieren/ }).click();
  await expect(page.locator('nav.tabs')).toBeVisible();
  await expect(page.locator('h1.gruss')).toHaveText(/Guten Morgen!/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('fk.config.v1')))).toEqual({ v: 1, modus: 'demo' });
  await page.reload();
  await expect(page.locator('nav.tabs')).toBeVisible();
});

test.describe('Code eingeben', () => {
  test.use({ erlaubteFehler: NETZFEHLER }); // das Google-Skript wird vorgeladen; ohne Netz scheitert das hörbar

  test('„Ich habe einen Code“ lehnt einen falschen Code ab und führt zurück', async ({ page }) => {
    await page.route(/accounts\.google\.com|googleapis\.com/, (r) => r.abort());
    await page.goto('/');
    await page.getByRole('button', { name: /Ich habe einen Code/ }).click();
    await expect(page.getByRole('heading', { name: /Ich habe einen Code/ })).toBeVisible();
    await page.getByRole('textbox', { name: 'Einrichtungscode' }).fill('FK1.abc.def.ghi.000000');
    await page.getByRole('button', { name: 'Weiter mit Google' }).click();
    await expect(page.locator('.fehlertext')).toContainText('Der Code ist unvollständig oder falsch kopiert');
    await page.getByRole('button', { name: '‹ Zurück' }).click();
    await expect(page.locator('.willkommen-knopf')).toHaveCount(3);
  });
});
