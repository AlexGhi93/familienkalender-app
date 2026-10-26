// „Monat“: blättern, Tag antippen → Tagesblatt mit „Eintragen“, Tagestyp setzen und im Raster sehen; „Neu an diesem Tag“
// (das Formular beginnt mit dem Tag) und „Bringen & Abholen“ für künftige Betreuungstage (gilt nur für diesen Tag).
import { test, expect, starteDemo, tab, erwarteToast, WERKTAG_DATUM } from './hilfen.js';
import { seedDemo } from '../../src/app/seed.js';

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
  await erwarteToast(page, 'Gelöscht ✓');
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

test.describe('Löschen im Tagesblatt mit „Rückgängig“ (1.1.1)', () => {
  const meldung = (page) => page.locator('.toast').filter({ hasText: 'Gelöscht ✓' });

  test('Termin: nach der Rückfrage gelöscht; „Rückgängig“ bringt ihn zurück (bleibt nach dem Neuladen)', async ({ page }) => {
    await starteDemo(page, { route: '#/monat' });
    await zelle(page, 'Donnerstag, 15. Oktober').click();
    const blatt = page.getByRole('dialog', { name: 'Donnerstag, 15. Oktober' });
    const termin = blatt.locator('.zeile').filter({ hasText: 'Kinderarzt' });
    await termin.getByRole('button', { name: 'Löschen' }).click();
    await page.getByRole('dialog', { name: 'Termin löschen?' }).getByRole('button', { name: 'Termin löschen' }).click();
    await expect(meldung(page).getByRole('button', { name: 'Rückgängig' })).toBeVisible();
    await expect(termin).toHaveCount(0);
    await meldung(page).getByRole('button', { name: 'Rückgängig' }).click();
    await erwarteToast(page, 'Wiederhergestellt ✓');
    await expect(termin).toHaveCount(1);
    await page.reload();
    await zelle(page, 'Donnerstag, 15. Oktober').click();
    await expect(page.getByRole('dialog', { name: 'Donnerstag, 15. Oktober' }).locator('.zeile').filter({ hasText: 'Kinderarzt' })).toHaveCount(1);
  });

  test('Sache (keine Serie): gelöscht und mit „Rückgängig“ wieder da', async ({ page }) => {
    await starteDemo(page, { route: '#/monat' });
    await zelle(page, 'Montag, 19. Oktober').click();
    const blatt = page.getByRole('dialog', { name: 'Montag, 19. Oktober' });
    const sache = blatt.locator('.zeile').filter({ has: page.getByRole('button', { name: 'Erledigt ✓' }) });
    await expect(sache).toHaveCount(1);
    await sache.getByRole('button', { name: 'Löschen' }).click();
    await page.getByRole('dialog', { name: 'Sache löschen?' }).getByRole('button', { name: 'Löschen' }).click();
    await expect(meldung(page).getByRole('button', { name: 'Rückgängig' })).toBeVisible();
    await expect(sache).toHaveCount(0);
    await meldung(page).getByRole('button', { name: 'Rückgängig' }).click();
    await erwarteToast(page, 'Wiederhergestellt ✓');
    await expect(sache).toHaveCount(1);
  });

  test('Urlaub und Tageseintrag: gelöscht und mit „Rückgängig“ wieder da', async ({ page }) => {
    await starteDemo(page, { route: '#/monat' });
    // Tageseintrag
    const tag = zelle(page, 'Donnerstag, 22. Oktober');
    await tag.click();
    await eintragenChips(page.getByRole('dialog')).filter({ hasText: 'Krank' }).click();
    await erwarteToast(page, 'Gespeichert ✓');
    await page.getByRole('dialog').getByRole('button', { name: 'Eintrag löschen' }).click();
    await expect(meldung(page).getByRole('button', { name: 'Rückgängig' })).toBeVisible();
    await expect(tag.locator('i')).toHaveCount(0);
    await meldung(page).getByRole('button', { name: 'Rückgängig' }).click();
    await erwarteToast(page, 'Wiederhergestellt ✓');
    await expect(tag.locator('i')).toHaveText('🤒');
    await page.keyboard.press('Escape');

    // Urlaub (der ganze Zeitraum)
    await page.getByRole('button', { name: 'Nächster Monat' }).click();
    await zelle(page, 'Mittwoch, 4. November').click();
    const blatt = page.getByRole('dialog', { name: 'Mittwoch, 4. November' });
    await blatt.locator('.zeile').filter({ hasText: 'Urlaub' }).getByRole('button', { name: 'Löschen' }).click();
    await page.getByRole('dialog', { name: 'Urlaub löschen?' }).getByRole('button', { name: 'Urlaub löschen' }).click();
    await expect(meldung(page).getByRole('button', { name: 'Rückgängig' })).toBeVisible();
    await expect(blatt.locator('.zeile').filter({ hasText: 'Urlaub' })).toHaveCount(0);
    await meldung(page).getByRole('button', { name: 'Rückgängig' }).click();
    await erwarteToast(page, 'Wiederhergestellt ✓');
    await expect(blatt.locator('.zeile').filter({ hasText: 'Urlaub' })).toHaveCount(1);
  });
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

// Glas und Bento (themes/monat.css): die Haken .monat-seite und .tb-* tragen das Aussehen; heute, Konflikt und Tage außerhalb des
// Monats bleiben unterscheidbar und lesbar, Zellen und „Eintragen“ bleiben ≥ 44 px groß.
test.describe('Monat und Tagesblatt in Glas und Bento', () => {
  test.beforeEach(({ aussehen }) => test.skip(!aussehen, 'nur in den Projekten telefon-glas und telefon-bento'));

  test('Raster: heute mit Ring, Konflikt gestrichelt mit Abzeichen, Tage außerhalb ohne Abblenden, Zellen ≥ 44 px', async ({ page, aussehen }) => {
    const demo = seedDemo(WERKTAG_DATUM);
    demo.tage = { ...demo.tage, '2026-10-20': { typ: 'krank', konflikt: true, andere: ['kita_essen'] } };
    await starteDemo(page, { route: '#/monat', speicher: { 'fk.demo.v1': demo } });
    await expect(page.locator('.screen.monat-seite .raster')).toBeVisible();

    const heute = page.locator('.raster .zelle.heute');
    await expect(heute).toHaveCSS('outline-style', 'none');
    expect(await heute.evaluate((z) => getComputedStyle(z).boxShadow)).not.toBe('none');

    const konflikt = page.locator('.raster .zelle.konflikt');
    await expect(konflikt).toHaveCSS('outline-style', 'dashed');
    await expect(konflikt.locator('.konflikt-marke')).toBeVisible();

    const aussen = page.locator('.raster .zelle.ausserhalb').first();
    await expect(aussen).toHaveCSS('opacity', '1');
    await expect(aussen).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

    for (const box of await page.locator('.raster .zelle').evaluateAll((zs) => zs.map((z) => z.getBoundingClientRect().toJSON()))) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    if (aussehen === 'glas') {
      // Wochentage und Raster sind eine Glaskarte: keine Lücke dazwischen
      const [oben, unten] = await Promise.all(['.wochentage', '.raster'].map((s) => page.locator(`.monat-seite > ${s}`).evaluate((e) => e.getBoundingClientRect().toJSON())));
      expect(Math.abs(unten.top - oben.bottom)).toBeLessThan(1);
    } else {
      // Bento: die Zahl von heute ist eine Pille in der Akzentfarbe
      expect(await heute.locator('.nr').evaluate((n) => getComputedStyle(n).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
    }
  });

  test('Wochentage ≥ 16 px; bei 375 px: Zellen ≥ 44 px, die Karte steht in der Flucht der Seite, kein waagerechtes Scrollen', async ({ page, aussehen }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await starteDemo(page, { route: '#/monat' });
    await expect(page.locator('.screen.monat-seite .raster')).toBeVisible();
    for (const groesse of await page.locator('.wochentage span').evaluateAll((ss) => ss.map((s) => parseFloat(getComputedStyle(s).fontSize)))) {
      expect(groesse).toBeGreaterThanOrEqual(16);
    }
    for (const box of await page.locator('.raster .zelle').evaluateAll((zs) => zs.map((z) => z.getBoundingClientRect().toJSON()))) {
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    const kanten = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      return { wt: r('.monat-seite > .wochentage'), raster: r('.monat-seite > .raster'), stat: r('.monat-seite > .statistik') };
    });
    for (const k of [kanten.wt, kanten.raster]) {
      expect(Math.abs(k.left - kanten.stat.left), `${aussehen}: linke Kante wie die Statistik-Karte`).toBeLessThan(0.5);
      expect(Math.abs(k.right - kanten.stat.right), `${aussehen}: rechte Kante wie die Statistik-Karte`).toBeLessThan(0.5);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  // monat.css darf nur Monat und Tagesblatt treffen: .monat-kopf gibt es auch in Schicht (sp-monat) und Urlaub (jahr-wahl)
  for (const route of ['#/schicht', '#/urlaub', '#/heute', '#/konto', '#/mehr']) {
    test(`themes/monat.css trifft auf ${route} kein Element (auch nicht die Pfeile von Schicht und Urlaub)`, async ({ page }) => {
      await starteDemo(page, { route });
      if (route === '#/schicht') await expect(page.locator('.sp-monat .rund').first()).toBeVisible();
      if (route === '#/urlaub') await expect(page.locator('.jahr-wahl .rund').first()).toBeVisible();
      const treffer = await page.evaluate(() => {
        const blatt = [...document.styleSheets].find((s) => s.href?.endsWith('/themes/monat.css'));
        const selektoren = [];
        const sammle = (regeln) => {
          for (const r of regeln) {
            if (r.selectorText) selektoren.push(...r.selectorText.split(','));
            else if (r.cssRules) sammle(r.cssRules);
          }
        };
        sammle(blatt.cssRules);
        const pfeile = [...document.querySelectorAll('.sp-monat .rund, .jahr-wahl .rund')];
        const aus = [];
        for (const sel of selektoren) {
          for (const el of document.querySelectorAll(sel)) if (el !== document.documentElement) aus.push(`${sel.trim()} → ${el.className}`);
          for (const el of pfeile) if (el.matches(sel)) aus.push(`Pfeil: ${sel.trim()}`);
        }
        return { anzahl: selektoren.length, aus: [...new Set(aus)] };
      });
      expect(treffer.anzahl).toBeGreaterThan(50);
      expect(treffer.aus).toEqual([]);
    });
  }

  test('Tagesblatt: „Eintragen“ als Zweierraster mit gleich breitem Rand (aktiv und nicht aktiv), Felder ≥ 44 px', async ({ page }) => {
    await starteDemo(page, { route: '#/monat' });
    await zelle(page, 'Dienstag, 13. Oktober').click();
    const blatt = page.getByRole('dialog', { name: 'Dienstag, 13. Oktober' });
    await expect(blatt.locator('.tb-eintraege .zeile')).toHaveCount(1);
    await expect(blatt.locator('.tb-neu .chip').first()).toBeVisible();
    await expect(blatt.locator('.tb-eintragen')).toHaveCSS('display', 'grid');
    const chips = blatt.locator('.tb-eintragen .chip');
    await expect(blatt.locator('.tb-eintragen .chip.aktiv')).toHaveCount(1);
    const raender = await chips.evaluateAll((cs) => cs.map((c) => getComputedStyle(c).borderTopWidth));
    expect(new Set(raender).size).toBe(1);
    for (const box of await chips.evaluateAll((cs) => cs.map((c) => c.getBoundingClientRect().toJSON()))) expect(box.height).toBeGreaterThanOrEqual(44);
  });
});
