// „Monat“: blättern, Tag antippen → Tagesblatt mit „Eintragen“, Tagestyp setzen und im Raster sehen; „Neu an diesem Tag“
// (das Formular beginnt mit dem Tag) und „Bringen & Abholen“ für künftige Betreuungstage (gilt nur für diesen Tag).
import { test, expect, starteDemo, tab, erwarteToast } from './hilfen.js';

const zelle = (page, name) => page.locator('.raster').getByRole('button', { name, exact: false });
/** Die Chips unter der Überschrift „Eintragen“ bzw. „Neu an diesem Tag“ im Tagesblatt. */
const eintragenChips = (blatt) => blatt.locator('h3:text-is("Eintragen") + .chip-reihe .chip');
const neuChips = (blatt) => blatt.locator('h3:text-is("Neu an diesem Tag") + .chip-reihe .chip');

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
  const chips = eintragenChips(blatt);
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

test.describe('Neu an diesem Tag', () => {
  for (const [chip, formular] of [
    ['🩺 Arzttermin', 'Arzttermin'],
    ['📌 Termin', 'Termin'],
    ['👕 Sachen', 'Sachen für Krabbelstube'],
  ]) {
    test(`„${chip}“ öffnet das Formular „${formular}“ mit dem angetippten Tag`, async ({ page }) => {
      await starteDemo(page, { route: '#/monat' });
      await zelle(page, 'Freitag, 23. Oktober').click();
      const blatt = page.getByRole('dialog', { name: 'Freitag, 23. Oktober' });
      await expect(blatt.getByRole('heading', { name: 'Neu an diesem Tag' })).toBeVisible();
      await expect(neuChips(blatt)).toHaveText(['🩺 Arzttermin', '📌 Termin', '👕 Sachen']);
      await neuChips(blatt).filter({ hasText: chip }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page).toHaveURL(/#\/neu$/);
      await expect(page.locator('.formular .karte-text b')).toHaveText(formular);
      await expect(page.getByRole('textbox', { name: 'Datum', exact: true })).toHaveValue('23.10.2026');
      await expect(page.locator('.eingabe-hinweis').first()).toHaveText('Freitag, 23. Oktober');
    });
  }

  test('Arzttermin vom Tag aus speichern: der Termin steht an diesem Tag im Raster und im Tagesblatt', async ({ page }) => {
    await starteDemo(page, { route: '#/monat' });
    const tag = zelle(page, 'Freitag, 23. Oktober');
    const arztPunkt = tag.locator('.punkt', { hasText: '🩺' });
    await expect(arztPunkt).toHaveCount(0); // an dem Tag gibt es nur Sachen (👕)
    await tag.click();
    await neuChips(page.getByRole('dialog')).filter({ hasText: 'Arzttermin' }).click();
    await page.getByRole('textbox', { name: 'Uhrzeit', exact: true }).fill('11:00');
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await erwarteToast(page, 'Termin gespeichert ✓');
    await expect(page).toHaveURL(/#\/monat$/);
    await expect(page.locator('.monat-kopf h1')).toHaveText('Oktober 2026');
    await expect(arztPunkt).toHaveCount(1);
    await tag.click();
    await expect(page.getByRole('dialog', { name: 'Freitag, 23. Oktober' }).locator('.zeile').filter({ hasText: 'Kinderarzt' })).toContainText('11:00');
  });
});

test.describe('Bringen & Abholen im Tagesblatt', () => {
  const dienstBlatt = (blatt) => blatt.locator('.dienst-blatt');
  const bringt = (blatt) => dienstBlatt(blatt).getByRole('button', { name: /bringt/ });
  const holt = (blatt) => dienstBlatt(blatt).getByRole('button', { name: /holt/ });

  test('an einem künftigen Betreuungstag: zwei Knöpfe, Antippen wechselt — → Papa → Mama → —, nur für diesen Tag', async ({ page }) => {
    await starteDemo(page, { route: '#/monat' });
    await zelle(page, 'Donnerstag, 22. Oktober').click();
    const blatt = page.getByRole('dialog', { name: 'Donnerstag, 22. Oktober' });
    await expect(dienstBlatt(blatt).getByRole('heading', { name: '🚗 Bringen & Abholen' })).toBeVisible();
    await expect(dienstBlatt(blatt)).toContainText('Gilt nur für diesen Tag; den Wochenplan gibt es in „Mehr“.');
    await expect(bringt(blatt)).toHaveAccessibleName('Wer bringt? 07:30. Antippen wechselt, nur für diesen Tag.');
    await expect(holt(blatt)).toHaveAccessibleName('Wer holt? 15:30. Antippen wechselt, nur für diesen Tag.');
    await expect(bringt(blatt)).toHaveText('❔ Wer?bringt 07:30');

    await bringt(blatt).click();
    await erwarteToast(page, 'Nur für diesen Tag geändert ✓');
    await expect(bringt(blatt)).toHaveAccessibleName('Papa bringt 07:30. Antippen wechselt, nur für diesen Tag.');
    await expect(bringt(blatt)).toHaveText('👨 Papabringt 07:30');
    await expect(bringt(blatt)).toHaveClass(/papa/);
    await bringt(blatt).click();
    await expect(bringt(blatt)).toHaveText('👩 Mamabringt 07:30');
    await holt(blatt).click();
    await expect(holt(blatt)).toHaveText('👨 Papaholt 15:30');
    await bringt(blatt).click();
    await expect(bringt(blatt)).toHaveText('❔ Wer?bringt 07:30'); // wieder niemand
    await bringt(blatt).click();
    await expect(bringt(blatt)).toHaveText('👨 Papabringt 07:30');
    await blatt.getByRole('button', { name: 'Schließen' }).click();

    // nur dieser Donnerstag: der Tag danach und der Donnerstag eine Woche später bleiben beim (leeren) Wochenplan
    for (const anderer of ['Freitag, 23. Oktober', 'Donnerstag, 29. Oktober']) {
      await zelle(page, anderer).click();
      const b = page.getByRole('dialog', { name: anderer });
      await expect(bringt(b)).toHaveText('❔ Wer?bringt 07:30');
      await expect(holt(b)).toHaveText('❔ Wer?holt 15:30');
      await b.getByRole('button', { name: 'Schließen' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    // gespeichert ist eine Ausnahme für den 22.10., kein Wochenplan
    const settings = await page.evaluate(() => JSON.parse(localStorage.getItem('fk.demo.v1')).settings);
    expect(settings.dienstAusnahmen).toEqual({ '2026-10-22': { b: 'papa', h: 'papa' } });
    expect(settings.dienstplan).toEqual({ b: ['', '', '', '', '', '', ''], h: ['', '', '', '', '', '', ''] });
  });

  test('heute und morgen heißt die Meldung „Nur für heute/morgen geändert ✓“', async ({ page }) => {
    await starteDemo(page, { route: '#/monat' });
    await zelle(page, 'Mittwoch, 14. Oktober').click();
    await bringt(page.getByRole('dialog')).click();
    await erwarteToast(page, 'Nur für heute geändert ✓');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await zelle(page, 'Donnerstag, 15. Oktober').click();
    await holt(page.getByRole('dialog')).click();
    await erwarteToast(page, 'Nur für morgen geändert ✓');
  });

  for (const [tag, grund] of [
    ['Dienstag, 13. Oktober', 'vorbei'],
    ['Samstag, 17. Oktober', 'Wochenende'],
    ['Montag, 26. Oktober, Nationalfeiertag', 'Feiertag'],
  ]) {
    test(`kein „Bringen & Abholen“: ${tag} (${grund})`, async ({ page }) => {
      await starteDemo(page, { route: '#/monat' });
      await zelle(page, tag).click();
      const blatt = page.getByRole('dialog');
      await expect(blatt.getByRole('heading', { name: 'Neu an diesem Tag' })).toBeVisible();
      await expect(dienstBlatt(blatt)).toHaveCount(0);
    });
  }

  test('kein „Bringen & Abholen“ im Urlaub und an einem Tag, an dem das Kind krank ist', async ({ page }) => {
    await starteDemo(page, { route: '#/monat' });
    await zelle(page, 'Freitag, 16. Oktober').click();
    const blatt = page.getByRole('dialog', { name: 'Freitag, 16. Oktober' });
    await expect(dienstBlatt(blatt)).toBeVisible();
    await eintragenChips(blatt).filter({ hasText: 'Krank' }).click();
    await erwarteToast(page, 'Gespeichert ✓');
    await expect(dienstBlatt(blatt)).toHaveCount(0);
    await blatt.getByRole('button', { name: 'Schließen' }).click();
    await page.getByRole('button', { name: 'Nächster Monat' }).click();
    await zelle(page, 'Mittwoch, 4. November').click();
    await expect(page.getByRole('dialog', { name: 'Mittwoch, 4. November' }).getByRole('heading', { name: 'Neu an diesem Tag' })).toBeVisible();
    await expect(dienstBlatt(page.getByRole('dialog'))).toHaveCount(0);
  });
});
