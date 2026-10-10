// „Monat“: blättern, Tag antippen → Tagesblatt mit „Eintragen“, Tagestyp setzen und im Raster sehen.
import { test, expect, starteDemo, tab, erwarteToast } from './hilfen.js';

const zelle = (page, name) => page.locator('.raster').getByRole('button', { name, exact: false });

test('Raster, Legende und Statistik', async ({ page }) => {
  await starteDemo(page, { route: '#/monat' });
  await expect(page).toHaveTitle('Familienkalender · Monat');
  await expect(page.locator('.monat-kopf h1')).toHaveText('Oktober 2026');
  await expect(page.locator('.wochentage span')).toHaveText(['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']);
  await expect(page.locator('.raster .zelle')).toHaveCount(35);
  await expect(page.locator('.raster .zelle.heute')).toHaveText(/^14/);
  await expect(page.locator('.raster .zelle.ausserhalb')).toHaveCount(4); // 28.–30.9. und 1.11.
  await expect(zelle(page, 'Montag, 26. Oktober, Nationalfeiertag')).toContainText('🎉');
  await expect(zelle(page, 'Montag, 19. Oktober')).toHaveAccessibleName(/Sachen für die Einrichtung, Termin/);
  await expect(page.locator('.legende span')).toHaveCount(8);
  await expect(page.locator('.statistik')).toContainText('Oktober: 7 Tage Krabbelstube, davon 6 mit Mittagessen');
});

test('blättern vor und zurück, auch über den Jahreswechsel', async ({ page }) => {
  await starteDemo(page, { route: '#/monat' });
  const titel = page.locator('.monat-kopf h1');
  await page.getByRole('button', { name: 'Nächster Monat' }).click();
  await expect(titel).toHaveText('November 2026');
  await expect(zelle(page, 'Montag, 2. November')).toContainText('✈️');
  await page.getByRole('button', { name: 'Nächster Monat' }).click();
  await page.getByRole('button', { name: 'Nächster Monat' }).click();
  await expect(titel).toHaveText('Januar 2027');
  await expect(page.locator('.statistik')).toContainText('In diesem Monat gibt es noch keine Einträge.');
  for (let i = 0; i < 4; i += 1) await page.getByRole('button', { name: 'Vorheriger Monat' }).click();
  await expect(titel).toHaveText('September 2026');
  // der gewählte Monat bleibt beim Wechsel der Registerkarte erhalten
  await tab(page, 'Heute');
  await tab(page, 'Monat');
  await expect(titel).toHaveText('September 2026');
});

test('Tag antippen: Tagesblatt mit Einträgen und „Eintragen“; Typ setzen, im Raster sehen, löschen', async ({ page }) => {
  await starteDemo(page, { route: '#/monat' });
  const tag = zelle(page, 'Donnerstag, 22. Oktober');
  await expect(tag.locator('i')).toHaveCount(0);
  await tag.click();
  const blatt = page.getByRole('dialog', { name: 'Donnerstag, 22. Oktober' });
  await expect(blatt).toBeVisible();
  await expect(blatt.locator('.zeile')).toContainText(['Impfung (Kind) 09:15']);
  await expect(blatt.getByRole('heading', { name: 'Eintragen' })).toBeVisible();
  const chips = blatt.locator('.chip-reihe .chip');
  await expect(chips).toHaveText(['🏫 Krabbelstube · Mittagessen', '🏫 Krabbelstube · ohne Essen', '🧸 Abwesend', '🤒 Krank', '🔒 Schließtag']);
  await chips.filter({ hasText: 'Krank' }).click();
  await erwarteToast(page, 'Gespeichert ✓');
  await expect(blatt.locator('.chip.aktiv')).toHaveText('🤒 Krank');
  await expect(blatt.locator('.zeile').filter({ hasText: 'Krank' })).toBeVisible();
  await blatt.getByRole('button', { name: 'Schließen' }).click();
  await expect(blatt).toHaveCount(0);
  await expect(tag.locator('i')).toHaveText('🤒');
  await expect(tag).toHaveClass(/getoent/);
  await expect(page.locator('.statistik')).toContainText('1 Tag krank');

  await tag.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Eintrag löschen' }).click();
  await erwarteToast(page, 'Eintrag gelöscht');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(tag.locator('i')).toHaveCount(0);
});

test('Tagesblatt im Urlaub: Urlaub hat Vorrang, Löschen fragt nach', async ({ page }) => {
  await starteDemo(page, { route: '#/monat' });
  await page.getByRole('button', { name: 'Nächster Monat' }).click();
  await zelle(page, 'Mittwoch, 4. November').click();
  const blatt = page.getByRole('dialog', { name: 'Mittwoch, 4. November' });
  await expect(blatt).toContainText('Dieser Tag liegt im Urlaub; der Urlaub hat Vorrang.');
  await blatt.locator('.zeile').filter({ hasText: 'Urlaub' }).getByRole('button', { name: 'Löschen' }).click();
  const frage = page.getByRole('dialog', { name: 'Urlaub löschen?' });
  await expect(frage).toContainText('Der ganze Urlaubszeitraum wird entfernt');
  await frage.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(frage).toHaveCount(0);
  await expect(blatt.locator('.zeile').filter({ hasText: 'Urlaub' })).toBeVisible();
});

test('Termin im Tagesblatt ändern führt ins Formular', async ({ page }) => {
  await starteDemo(page, { route: '#/monat' });
  await zelle(page, 'Donnerstag, 15. Oktober').click();
  await page.getByRole('dialog').locator('.zeile').filter({ hasText: 'Kinderarzt' }).getByRole('button', { name: 'Ändern' }).click();
  await expect(page).toHaveURL(/#\/neu$/);
  await expect(page.locator('.formular .karte-text b')).toHaveText('Arzttermin ändern');
  await expect(page.getByRole('button', { name: 'Änderungen speichern' })).toBeVisible();
});
