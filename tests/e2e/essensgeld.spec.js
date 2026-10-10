// Essensgeld: „Preis pro Mittagessen“ in Mehr → Betreuung; die Statistik im Monat rechnet damit „Essensgeld: ca. … (N × … €)“.
import { test, expect, starteDemo, tab, erwarteToast, WERKTAG_DATUM } from './hilfen.js';
import { seedDemo } from '../../src/app/seed.js';

const statistik = (page) => page.locator('.statistik p');
const preisFeld = (page) => page.locator('#menue-betreuung').getByRole('textbox', { name: 'Preis pro Mittagessen' });
const gespeichert = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('fk.demo.v1')).settings.essenPreisCent);

/** Demo mit einem Preis pro Mittagessen (Cent), als hätte man ihn schon eingetragen. */
function demoMitPreis(cent) {
  const demo = seedDemo(WERKTAG_DATUM);
  return { 'fk.demo.v1': { ...demo, settings: { ...demo.settings, essenPreisCent: cent } } };
}

async function preisEintragen(page, text) {
  const feld = preisFeld(page);
  await feld.fill(text);
  await feld.press('Enter');
}

test('ohne Preis keine Zeile „Essensgeld“', async ({ page }) => {
  await starteDemo(page, { route: '#/monat' });
  await expect(statistik(page)).toHaveText(['Oktober: 7 Tage Krabbelstube, davon 6 mit Mittagessen', '1 Tag abwesend']);
  await expect(page.locator('.statistik')).not.toContainText('Essensgeld');
});

test('Preis in Mehr → Betreuung eintragen: der Monat rechnet das Essensgeld aus', async ({ page }) => {
  await starteDemo(page, { route: '#/mehr' });
  await page.locator('.menue-eintrag[data-id="betreuung"] .menue-zeile').click();
  await expect(preisFeld(page)).toHaveValue('');
  await expect(preisFeld(page)).toHaveAttribute('placeholder', 'z. B. 3,50');
  await expect(page.locator('#menue-betreuung')).toContainText('Steht auf der Rechnung der Krabbelstube. Leer lassen = aus.');
  await preisEintragen(page, '3,50');
  await erwarteToast(page, 'Gespeichert ✓');
  await expect.poll(() => gespeichert(page)).toBe(350);
  await expect(preisFeld(page)).toHaveValue('3,50');

  await tab(page, 'Monat');
  await expect(statistik(page)).toHaveText([
    'Oktober: 7 Tage Krabbelstube, davon 6 mit Mittagessen',
    'Essensgeld: ca. 21 € (6 × 3,50 €)',
    '1 Tag abwesend',
  ]);

  // ein weiterer Tag mit Mittagessen zählt sofort mit, einer ohne Essen nicht
  await page.locator('.raster').getByRole('button', { name: 'Donnerstag, 15. Oktober' }).click();
  await page.getByRole('dialog').locator('.chip', { hasText: 'Krabbelstube · Mittagessen' }).click();
  await erwarteToast(page, 'Gespeichert ✓');
  await page.keyboard.press('Escape');
  await expect(statistik(page).nth(1)).toHaveText('Essensgeld: ca. 24,50 € (7 × 3,50 €)');
  await page.locator('.raster').getByRole('button', { name: 'Freitag, 16. Oktober' }).click();
  await page.getByRole('dialog').locator('.chip', { hasText: 'Krabbelstube · ohne Essen' }).click();
  await erwarteToast(page, 'Gespeichert ✓');
  await page.keyboard.press('Escape');
  await expect(statistik(page).first()).toHaveText('Oktober: 9 Tage Krabbelstube, davon 7 mit Mittagessen');
  await expect(statistik(page).nth(1)).toHaveText('Essensgeld: ca. 24,50 € (7 × 3,50 €)');
});

test('ein Monat ohne Mittagessen hat auch mit Preis keine Zeile', async ({ page }) => {
  await starteDemo(page, { route: '#/monat', speicher: demoMitPreis(350) });
  await expect(statistik(page).nth(1)).toHaveText('Essensgeld: ca. 21 € (6 × 3,50 €)');
  for (let i = 0; i < 3; i += 1) await page.getByRole('button', { name: 'Nächster Monat' }).click();
  await expect(page.locator('.monat-kopf h1')).toHaveText('Januar 2027');
  await expect(page.locator('.statistik')).toHaveText('In diesem Monat gibt es noch keine Einträge.');
});

test('Preis: Schreibweisen, Fehler und Leeren (= aus)', async ({ page }) => {
  await starteDemo(page, { route: '#/mehr' });
  await page.locator('.menue-eintrag[data-id="betreuung"] .menue-zeile').click();

  await preisEintragen(page, '4 €');
  await erwarteToast(page, 'Gespeichert ✓');
  await expect.poll(() => gespeichert(page)).toBe(400);
  await expect(preisFeld(page)).toHaveValue('4,00');

  await preisEintragen(page, '3.2');
  await expect.poll(() => gespeichert(page)).toBe(320);
  await expect(preisFeld(page)).toHaveValue('3,20');

  for (const falsch of ['0', '51', 'drei Euro', '3,555']) {
    await preisEintragen(page, '3,20'); // unverändert: kein Speichern, die Markierung verschwindet
    await expect(preisFeld(page)).not.toHaveAttribute('aria-invalid');
    await preisEintragen(page, falsch);
    await erwarteToast(page, 'Preis: bitte einen Betrag wie 3,50 eingeben (höchstens 50 €). Leer lassen = aus.');
    await expect(preisFeld(page)).toHaveAttribute('aria-invalid', 'true');
    expect(await gespeichert(page)).toBe(320);
  }

  await preisEintragen(page, '');
  await erwarteToast(page, 'Gespeichert ✓');
  await expect.poll(() => gespeichert(page)).toBeNull();
  await expect(preisFeld(page)).not.toHaveAttribute('aria-invalid');
  await tab(page, 'Monat');
  await expect(page.locator('.statistik')).not.toContainText('Essensgeld');
});
