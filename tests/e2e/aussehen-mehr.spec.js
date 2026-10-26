// Glas und Bento (Aufgabe 9): „Mehr“ und die übrigen Seiten. Das Menü besteht aus einzelnen Flächen, die Symbole spielen weiter ihre
// eigene Bewegung (und stehen bei „Bewegung: Reduziert“ still), die Darstellung hat Umschalter mit gleitender Fläche und drei
// Aussehen-Kacheln mit Vorschau und ✓, und alle Ziele sind mindestens 44 px groß. Klassisch prüft die visuelle Regression.
import { test, expect, starteDemo, tab, WERKTAG } from './hilfen.js';

test.beforeEach(({ aussehen }) => test.skip(!aussehen, 'nur in den Projekten telefon-glas und telefon-bento'));

/** Alle sichtbaren Knöpfe, Links, Felder und Aufklapper im Inhalt (ohne Tab-Leiste) mit Breite oder Höhe unter 44 px. */
const kleineZiele = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('#inhalt button, #inhalt a[href], #inhalt summary, #inhalt input, #inhalt textarea, main button')]
      .filter((e) => e.getClientRects().length > 0 && !e.classList.contains('picker-unsichtbar')) // unsichtbare Auswahl liegt im 44-px-Knopf
      .map((e) => ({ name: (e.getAttribute('aria-label') || e.textContent).trim().slice(0, 30), r: e.getBoundingClientRect() }))
      .filter(({ r }) => r.width < 44 || r.height < 44)
      .map(({ name, r }) => `${name} ${Math.round(r.width)}×${Math.round(r.height)}`),
  );

test('Mehr: jede Zeile ist eine eigene Fläche mit Abstand, die Menü-Karte selbst ist unsichtbar', async ({ page }) => {
  await starteDemo(page, { route: '#/mehr' });
  const menue = page.locator('.karte.menue').nth(1);
  expect(await menue.evaluate((el) => getComputedStyle(el).backgroundImage)).toBe('none');
  expect(await menue.evaluate((el) => getComputedStyle(el).boxShadow)).toBe('none');
  const zeilen = menue.locator('.menue-eintrag');
  const a = await zeilen.nth(0).boundingBox();
  const b = await zeilen.nth(1).boundingBox();
  expect(b.y - (a.y + a.height)).toBeGreaterThanOrEqual(8);
  expect(await zeilen.nth(0).evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).not.toBe('0px');
});

test('Mehr: alle Ziele ≥ 44 px, auch in aufgeklappten Zeilen', async ({ page }) => {
  await starteDemo(page, { route: '#/mehr' });
  expect(await kleineZiele(page)).toEqual([]);
  for (const id of ['betreuung', 'familie', 'zeiten', 'bringen', 'urlaub', 'mitnehmen', 'sachen', 'kontostand', 'nachrichten']) {
    await page.locator(`.menue-eintrag[data-id="${id}"] .menue-zeile`).click();
    await expect(page.locator(`#menue-${id}`)).toBeVisible();
    await expect.poll(() => kleineZiele(page), { message: id }).toEqual([]);
  }
});

test.describe('mit Bewegung', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } });

  test('Mehr: die Symbole spielen weiter ihre eigene Bewegung; bei „Reduziert“ steht alles still', async ({ page }) => {
    await starteDemo(page, { route: '#/heute' });
    await tab(page, 'Mehr');
    const namen = () => page.locator('.menue-symbol').evaluateAll((els) => els.map((el) => getComputedStyle(el).animationName));
    expect((await namen()).every((n) => n.startsWith('m-'))).toBe(true);

    await page.evaluate(() => localStorage.setItem('fk.bewegung.v1', 'reduziert'));
    await page.reload();
    await expect(page.locator('.menue-symbol.spielt')).toHaveCount(11);
    expect((await namen()).every((n) => n === 'none')).toBe(true);
    await page.locator('.menue-eintrag[data-id="familie"] .menue-zeile').click();
    await expect(page.locator('#menue-familie')).toBeVisible();
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  });

  test('Darstellung: die Fläche des Umschalters gleitet zur Wahl (dieselben Knöpfe, neue Stelle)', async ({ page }) => {
    await starteDemo(page, { route: '#/app' });
    const reihe = page.getByRole('group', { name: 'Hell oder Dunkel' });
    const lage = () => reihe.evaluate((el) => new DOMMatrix(getComputedStyle(el, '::before').transform).m41);
    expect(await reihe.evaluate((el) => getComputedStyle(el, '::before').content)).toBe('""');
    expect(await lage()).toBe(0);
    await reihe.getByRole('button', { name: '🌙 Dunkel' }).click();
    // Ziel: Lage des Knopfs im Umschalter ohne seine Tipp-Skalierung (offsetLeft), abzüglich des Starts der Fläche
    const ziel = await reihe.evaluate((el) => el.querySelector('.chip:nth-child(3)').offsetLeft - parseFloat(getComputedStyle(el, '::before').left));
    expect(ziel).toBeGreaterThan(150);
    await expect.poll(async () => Math.abs((await lage()) - ziel)).toBeLessThan(1.5);
    expect(await reihe.evaluate((el) => getComputedStyle(el, '::before').transitionDuration)).toBe('0.5s');
  });
});

test('Darstellung: drei gleich breite Aussehen-Kacheln mit Vorschau; die gewählte trägt ✓', async ({ page, aussehen }) => {
  await starteDemo(page, { route: '#/app' });
  const kacheln = page.getByRole('group', { name: 'Aussehen' }).getByRole('button');
  await expect(kacheln).toHaveCount(3);
  const boxen = await kacheln.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()));
  expect(new Set(boxen.map((b) => Math.round(b.width))).size).toBe(1);
  expect(new Set(boxen.map((b) => Math.round(b.y))).size).toBe(1);
  for (const b of boxen) expect(b.height).toBeGreaterThanOrEqual(88);
  const gewaehlt = page.getByRole('button', { name: aussehen === 'glas' ? 'Glas & Licht' : 'Bento bunt' });
  await expect(gewaehlt).toHaveAttribute('aria-pressed', 'true');
  expect(await gewaehlt.evaluate((el) => getComputedStyle(el, '::after').content)).toMatch(/^"✓"/);
  expect(await page.getByRole('button', { name: 'Klassisch' }).evaluate((el) => getComputedStyle(el, '::after').content)).toBe('none');
  expect(await page.locator('.aussehen-vorschau.glas').evaluate((el) => getComputedStyle(el).backgroundImage)).toContain('radial-gradient');
  expect(await kleineZiele(page)).toEqual([]);
});

test('Verlauf, Willkommen, Code: Ziele ≥ 44 px; die Suche hat ihre Lupe', async ({ page }) => {
  await starteDemo(page, { route: '#/verlauf' });
  await expect(page.locator('#inhalt')).not.toContainText('Lade …');
  expect(await page.locator('.verlauf-suche').evaluate((el) => getComputedStyle(el).backgroundImage)).toContain('data:image/svg+xml');
  expect(await kleineZiele(page)).toEqual([]);

  await page.evaluate(() => localStorage.removeItem('fk.config.v1'));
  await page.clock.setFixedTime(new Date(WERKTAG));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Willkommen beim Familienkalender' })).toBeVisible();
  expect(await kleineZiele(page)).toEqual([]);
  await page.getByRole('button', { name: /Ich habe einen Code/ }).click();
  await expect(page.getByRole('textbox', { name: 'Einrichtungscode' })).toBeVisible();
  expect(await kleineZiele(page)).toEqual([]);
});

test('Nachricht: die vier Gruppen tragen ihre Farbe; der Ton ist ein Umschalter', async ({ page }) => {
  await starteDemo(page);
  await page.getByRole('button', { name: 'Krabbelstube benachrichtigen', exact: true }).click();
  const blatt = page.getByRole('dialog', { name: 'Nachricht an die Krabbelstube' });
  await expect(blatt.locator('.nachricht-gruppe')).toHaveCount(4);
  const farben = await blatt.locator('.nachricht-gruppe-titel').evaluateAll((els) => els.map((el) => getComputedStyle(el, '::before').backgroundColor));
  expect(new Set(farben).size).toBe(4);
  await blatt.locator('.nachricht-gruppe .chip').first().click();
  const ton = blatt.locator('.nachricht-ton .segment-wahl');
  await expect(ton).toBeVisible();
  expect(await ton.evaluate((el) => getComputedStyle(el).display)).toBe('grid');
  expect(await ton.evaluate((el) => getComputedStyle(el, '::before').content)).toBe('""');
});

test('Zeichen aus CSS (✓, ›) gehören nicht zum Namen: Knöpfe und Aufklapper heißen wie in Klassisch', async ({ page, aussehen }) => {
  await starteDemo(page, { route: '#/app' });
  const name = aussehen === 'glas' ? 'Glas & Licht' : 'Bento bunt';
  await expect(page.getByRole('group', { name: 'Aussehen' }).getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/#/mehr');
  await page.locator('.menue-eintrag[data-id="mitnehmen"] .menue-zeile').click();
  await expect(page.locator('#menue-mitnehmen summary').first()).toHaveAccessibleName(/Kinderarzt$/);
});
