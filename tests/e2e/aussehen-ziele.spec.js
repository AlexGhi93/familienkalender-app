// Ziele ≥ 44 px und „nichts springt“ in Glas und Bento (Task 10): schmale Telefone (360 px, z. B. größere Anzeige auf Samsung),
// der Schließen-Knopf neben einem langen Blatt-Titel, ein Chip wird beim Wählen nicht breiter. Die volle Prüfung aller Bildschirme
// (Kontrast ≥ 4,5:1 und Ziele ≥ 44 px) macht tests/visuell/kontrast.mjs.
import { test, expect, starteDemo } from './hilfen.js';

test.beforeEach(({ aussehen }) => {
  test.skip(!aussehen, 'nur Glas und Bento (Klassisch bleibt wie 1.1.2)');
});

const breiten = (locator) => locator.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width * 10) / 10));

for (const breite of [360, 375, 384]) {
  test(`${breite} px: Tab-Karten, Tage im Monat und im Schichtplan sind ≥ 44 px breit`, async ({ page }) => {
    await page.setViewportSize({ width: breite, height: 800 });
    await starteDemo(page, { route: '#/monat' });
    for (const b of await breiten(page.locator('nav.tabs > .tab'))) expect(b).toBeGreaterThanOrEqual(44);
    for (const b of await breiten(page.locator('.raster .zelle'))) expect(b).toBeGreaterThanOrEqual(44);
    await page.locator('nav.tabs').getByRole('link', { name: 'Schicht' }).click();
    await expect(page.locator('.sp-zelle').first()).toBeVisible();
    for (const b of await breiten(page.locator('.sp-zelle'))) expect(b).toBeGreaterThanOrEqual(44);
  });
}

test('Nachricht-Blatt: der Schließen-Knopf bleibt 44 × 44 neben dem langen Titel', async ({ page }) => {
  await starteDemo(page);
  await page.getByRole('button', { name: 'Krabbelstube benachrichtigen', exact: true }).click();
  const zu = page.getByRole('dialog', { name: 'Nachricht an die Krabbelstube' }).getByRole('button', { name: 'Schließen' });
  const box = await zu.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
});

test('ein Chip wird beim Wählen nicht breiter (gleiche Randbreite)', async ({ page }) => {
  await starteDemo(page);
  await page.getByRole('button', { name: 'Krabbelstube benachrichtigen', exact: true }).click();
  const blatt = page.getByRole('dialog', { name: 'Nachricht an die Krabbelstube' });
  const morgen = blatt.getByRole('button', { name: 'Morgen', exact: true });
  await expect(morgen).toHaveAttribute('aria-pressed', 'false');
  const vorher = (await morgen.boundingBox()).width;
  await morgen.click();
  await expect(blatt.getByRole('button', { name: 'Morgen', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect((await blatt.getByRole('button', { name: 'Morgen', exact: true }).boundingBox()).width).toBeCloseTo(vorher, 1);
});
