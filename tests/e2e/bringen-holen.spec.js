// „Wer bringt, wer holt?“: Wochenplan in Mehr → „Bringen & Abholen“ (— → 👨 Papa → 👩 Mama → —), Wahl der Benachrichtigungen,
// die Zeile „🚗 Heute“ auf Heute mit Ausnahmen nur für diesen Tag und am Abend „Morgen“.
import { test, expect, starteDemo, tab, erwarteToast, WERKTAG_DATUM } from './hilfen.js';
import { seedDemo } from '../../src/app/seed.js';

const WOCHE = (wert) => [wert, wert, wert, wert, wert, '', ''];
/** Papa bringt, Mama holt – Montag bis Freitag. */
const PLAN = { b: WOCHE('papa'), h: WOCHE('mama') };

function demoMit(settings) {
  const demo = seedDemo(WERKTAG_DATUM);
  return { 'fk.demo.v1': { ...demo, settings: { ...demo.settings, ...settings } } };
}
const gespeichert = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('fk.demo.v1')).settings);

const tafel = (page) => page.locator('#menue-bringen');
const planZeile = (page, tag) => tafel(page).locator('.dienst-plan-zeile').filter({ has: page.locator('.dienst-plan-tag', { hasText: new RegExp(`^${tag}$`) }) });
const dienstKarte = (page) => page.locator('article.dienst-karte');
const dienstZeile = (page, wann) => dienstKarte(page).locator('.dienst-zeile').filter({ has: page.locator('.dienst-wann', { hasText: wann }) });
const bringt = (bereich) => bereich.getByRole('button', { name: /bringt/ });
const holt = (bereich) => bereich.getByRole('button', { name: /holt/ });

test.describe('Mehr → Bringen & Abholen', () => {
  test('Wochenplan: eine Zeile je Betreuungstag, Antippen wechselt — → Papa → Mama → —', async ({ page }) => {
    await starteDemo(page, { route: '#/mehr' });
    await page.locator('.menue-eintrag[data-id="bringen"] .menue-zeile').click();
    await expect(tafel(page)).toContainText('Wer bringt dein Kind in die Krabbelstube und wer holt es ab?');
    await expect(tafel(page).locator('.dienst-plan-tag')).toHaveText(['Mo', 'Di', 'Mi', 'Do', 'Fr']);
    await expect(tafel(page).locator('.dienst-chip')).toHaveText(Array(10).fill('—'));

    const mi = planZeile(page, 'Mi').locator('.dienst-chip').first();
    await expect(mi).toHaveAccessibleName('Mittwoch: bringt niemand. Antippen wechselt.');
    for (const [text, name, person] of [
      ['👨 Papa', 'Mittwoch: bringt Papa. Antippen wechselt.', 'papa'],
      ['👩 Mama', 'Mittwoch: bringt Mama. Antippen wechselt.', 'mama'],
      ['—', 'Mittwoch: bringt niemand. Antippen wechselt.', ''],
    ]) {
      await planZeile(page, 'Mi').locator('.dienst-chip').first().click();
      await erwarteToast(page, 'Gespeichert ✓');
      await expect(planZeile(page, 'Mi').locator('.dienst-chip').first()).toHaveText(text);
      await expect(planZeile(page, 'Mi').locator('.dienst-chip').first()).toHaveAccessibleName(name);
      await expect.poll(async () => (await gespeichert(page)).dienstplan.b[2]).toBe(person);
    }
    await expect(planZeile(page, 'Mi').locator('.dienst-chip').first()).not.toHaveClass(/aktiv/);

    // „Holt“ am Freitag: Papa
    await planZeile(page, 'Fr').locator('.dienst-chip').nth(1).click();
    await expect(planZeile(page, 'Fr').locator('.dienst-chip').nth(1)).toHaveText('👨 Papa');
    await expect(planZeile(page, 'Fr').locator('.dienst-chip').nth(1)).toHaveClass(/aktiv/);
    await expect.poll(async () => (await gespeichert(page)).dienstplan).toEqual({ b: ['', '', '', '', '', '', ''], h: ['', '', '', '', 'papa', '', ''] });
    await expect(tafel(page)).toBeVisible(); // die Zeile bleibt nach dem Speichern offen
  });

  test('ein zusätzlicher Betreuungstag (Samstag) bekommt eine eigene Zeile', async ({ page }) => {
    await starteDemo(page, { route: '#/mehr' });
    await page.locator('.menue-eintrag[data-id="betreuung"] .menue-zeile').click();
    await page.locator('#menue-betreuung .chip', { hasText: /^Sa$/ }).click();
    await erwarteToast(page, 'Gespeichert ✓');
    await page.locator('.menue-eintrag[data-id="bringen"] .menue-zeile').click();
    await expect(tafel(page).locator('.dienst-plan-tag')).toHaveText(['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']);
  });

  test('ohne Betreuungstage: Hinweis statt Wochenplan', async ({ page }) => {
    await starteDemo(page, { route: '#/mehr', speicher: demoMit({ erwartung: [] }) });
    await page.locator('.menue-eintrag[data-id="bringen"] .menue-zeile').click();
    await expect(tafel(page).locator('.dienst-plan')).toHaveCount(0);
    await expect(tafel(page)).toContainText('Zuerst bei „Betreuung“ die Wochentage wählen.');
  });

  test('Benachrichtigungen für Sachen: an beide oder nur an wer bringt bzw. holt', async ({ page }) => {
    await starteDemo(page, { route: '#/mehr' });
    await page.locator('.menue-eintrag[data-id="bringen"] .menue-zeile').click();
    const wahl = tafel(page).locator('.feld').filter({ hasText: 'Benachrichtigungen der App für Sachen' });
    await expect(wahl.locator('.chip')).toHaveText(['👪 An beide', '🚗 Nur an den, der bringt bzw. holt']);
    await expect(wahl.locator('.chip.aktiv')).toHaveText('👪 An beide');
    await expect(wahl).toContainText('Wem welches Telefon gehört, steht in Konto & App.');
    await wahl.getByRole('button', { name: '🚗 Nur an den, der bringt bzw. holt' }).click();
    await erwarteToast(page, 'Gespeichert ✓');
    await expect(tafel(page).locator('.feld').filter({ hasText: 'Benachrichtigungen der App für Sachen' }).locator('.chip.aktiv')).toHaveText('🚗 Nur an den, der bringt bzw. holt');
    await expect.poll(async () => (await gespeichert(page)).dienstErinnerung).toBe('dienst');
    await tafel(page).getByRole('button', { name: '👪 An beide' }).click();
    await expect.poll(async () => (await gespeichert(page)).dienstErinnerung).toBe('beide');
  });
});

test.describe('Heute: „🚗 Heute“', () => {
  test('ohne Plan keine Zeile; sobald der Plan steht, zeigt Heute wer bringt und wer holt', async ({ page }) => {
    await starteDemo(page);
    await expect(page.locator('.kopf .pille')).toHaveText('Krabbelstube'); // Seite steht
    await expect(dienstKarte(page)).toHaveCount(0);

    await tab(page, 'Mehr');
    await page.locator('.menue-eintrag[data-id="bringen"] .menue-zeile').click();
    await planZeile(page, 'Mi').locator('.dienst-chip').first().click(); // Mittwoch (heute) bringt Papa
    await erwarteToast(page, 'Gespeichert ✓');
    await tab(page, 'Heute');
    const heute = dienstZeile(page, 'Heute');
    await expect(heute.locator('.dienst-wann')).toHaveText('🚗 Heute');
    await expect(bringt(heute)).toHaveText('👨 Papabringt 07:30');
    await expect(holt(heute)).toHaveText('❔ Wer?holt 15:30');
    await expect(dienstZeile(page, 'Morgen')).toHaveCount(0); // am Morgen nur heute
  });

  test('ein Tipp ändert nur heute („Nur für heute geändert ✓“); Wochenplan und andere Tage bleiben', async ({ page }) => {
    await starteDemo(page, { speicher: demoMit({ dienstplan: PLAN, bringzeit: '08:15' }) });
    const heute = dienstZeile(page, 'Heute');
    await expect(bringt(heute)).toHaveText('👨 Papabringt 08:15'); // die Uhrzeit kommt aus „Zeiten für Sachen“
    await expect(holt(heute)).toHaveText('👩 Mamaholt 15:30');
    await expect(bringt(heute)).toHaveAccessibleName('Papa bringt 08:15. Antippen wechselt, nur für diesen Tag.');

    await bringt(heute).click();
    await erwarteToast(page, 'Nur für heute geändert ✓');
    await expect(bringt(heute)).toHaveText('👩 Mamabringt 08:15');
    await expect.poll(async () => (await gespeichert(page)).dienstAusnahmen).toEqual({ '2026-10-14': { b: 'mama' } });

    // morgen und nächsten Mittwoch gilt weiter der Plan, und der Plan selbst ist unverändert
    await tab(page, 'Monat');
    for (const tag of ['Donnerstag, 15. Oktober', 'Mittwoch, 21. Oktober']) {
      await page.locator('.raster').getByRole('button', { name: tag }).click();
      await expect(bringt(page.getByRole('dialog', { name: tag }))).toHaveText('👨 Papabringt 08:15');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    await page.locator('.raster').getByRole('button', { name: 'Mittwoch, 14. Oktober' }).click();
    await expect(bringt(page.getByRole('dialog'))).toHaveText('👩 Mamabringt 08:15'); // dieselbe Ausnahme im Tagesblatt
    await page.keyboard.press('Escape');
    await tab(page, 'Mehr');
    await page.locator('.menue-eintrag[data-id="bringen"] .menue-zeile').click();
    await expect(planZeile(page, 'Mi').locator('.dienst-chip')).toHaveText(['👨 Papa', '👩 Mama']);

    // weiter antippen: niemand, dann wieder Papa – das ist der Plan, die Ausnahme verschwindet
    await tab(page, 'Heute');
    await bringt(heute).click();
    await expect(bringt(heute)).toHaveText('❔ Wer?bringt 08:15');
    await bringt(heute).click();
    await expect(bringt(heute)).toHaveText('👨 Papabringt 08:15');
    await expect.poll(async () => (await gespeichert(page)).dienstAusnahmen).toEqual({});
  });

  test('am Abend (ab der Abholzeit) steht auch „Morgen“ da; dort gilt die Änderung nur für morgen', async ({ page }) => {
    await starteDemo(page, { zeit: '2026-10-14T19:00:00+02:00', speicher: demoMit({ dienstplan: PLAN }) });
    await expect(dienstKarte(page).locator('.dienst-wann')).toHaveText(['🚗 Heute', '🚗 Morgen']);
    const morgen = dienstZeile(page, 'Morgen');
    await holt(morgen).click();
    await erwarteToast(page, 'Nur für morgen geändert ✓');
    await expect(holt(morgen)).toHaveText('❔ Wer?holt 15:30');
    await expect(holt(dienstZeile(page, 'Heute'))).toHaveText('👩 Mamaholt 15:30');
    await expect.poll(async () => (await gespeichert(page)).dienstAusnahmen).toEqual({ '2026-10-15': { h: '' } });
  });

  test('kurz vor der Abholzeit nur „Heute“; Freitagabend kein „Morgen“ (Samstag ist kein Betreuungstag)', async ({ page }) => {
    await starteDemo(page, { zeit: '2026-10-14T15:29:00+02:00', speicher: demoMit({ dienstplan: PLAN }) });
    await expect(dienstKarte(page).locator('.dienst-wann')).toHaveText(['🚗 Heute']);
    await page.clock.setFixedTime(new Date('2026-10-16T20:00:00+02:00'));
    await page.reload();
    await expect(page.locator('p.datum')).toHaveText('Freitag, 16. Oktober');
    await expect(dienstKarte(page).locator('.dienst-wann')).toHaveText(['🚗 Heute']);
  });

  test('heute niemand eingetragen: „Wer bringt heute?“ legt es mit einem Tipp fest', async ({ page }) => {
    // nur montags steht jemand im Plan: „Bringen & Abholen“ wird benutzt, heute (Mittwoch) ist aber leer
    await starteDemo(page, { speicher: demoMit({ dienstplan: { b: ['papa', '', '', '', '', '', ''], h: ['', '', '', '', '', '', ''] } }) });
    const leer = dienstKarte(page).getByRole('button', { name: /Wer bringt heute\?/ });
    await expect(leer).toContainText('Antippen zum Festlegen');
    await leer.click();
    await erwarteToast(page, 'Nur für heute geändert ✓');
    await expect(bringt(dienstZeile(page, 'Heute'))).toHaveText('👨 Papabringt 07:30');
    await expect(holt(dienstZeile(page, 'Heute'))).toHaveText('❔ Wer?holt 15:30');
  });

  test('ist das Kind heute krank, verschwindet die Zeile', async ({ page }) => {
    await starteDemo(page, { speicher: demoMit({ dienstplan: PLAN }) });
    await expect(dienstZeile(page, 'Heute')).toBeVisible();
    await page.locator('.aktionen button', { hasText: 'Krank' }).click();
    await erwarteToast(page, 'Eingetragen ✓');
    await expect(dienstKarte(page)).toHaveCount(0);
  });
});
