// „Mehr“: Menü mit animierten Symbolen, Akkordeon (immer nur eine Zeile offen), Speichern ohne Zuklappen und ohne neues Intro,
// reduzierte Bewegung, Wege zu „Konto & App“, „Verlauf“ und „Kontostand“.
import { test, expect, starteDemo, tab, erwarteToast } from './hilfen.js';

const IDS = ['app', 'betreuung', 'familie', 'zeiten', 'urlaub', 'mitnehmen', 'sachen', 'kontostand', 'verlauf'];
const ANIMATIONEN = ['m-nicken', 'm-blatt', 'm-wiegen', 'm-klingeln', 'm-fliegen', 'm-herz', 'm-huepfen', 'm-muenze', 'm-rolle'];
const KLAPPT = ['betreuung', 'familie', 'zeiten', 'urlaub', 'mitnehmen', 'sachen', 'kontostand'];

// Hier geht es um die Bewegung: anders als in den übrigen Tests (siehe playwright.config.js) ohne „reduzierte Bewegung“.
test.use({ contextOptions: { reducedMotion: 'no-preference' } });

const eintrag = (page, id) => page.locator(`.menue-eintrag[data-id="${id}"]`);
const zeile = (page, id) => eintrag(page, id).locator('.menue-zeile');
const tafel = (page, id) => page.locator(`#menue-${id}`);
const symbole = (page) => page.locator('.menue-symbol');
const animationen = (page) => symbole(page).evaluateAll((els) => els.map((el) => getComputedStyle(el).animationName));

test('Aufbau: neun Zeilen, sieben klappen auf, zwei führen weiter', async ({ page }) => {
  await starteDemo(page, { route: '#/mehr' });
  await expect(page).toHaveTitle('Familienkalender · Mehr');
  await expect(page.locator('.menue-eintrag')).toHaveCount(9);
  expect(await page.locator('.menue-eintrag').evaluateAll((els) => els.map((el) => el.dataset.id))).toEqual(IDS);
  await expect(page.locator('.menue-text b')).toHaveText(['Konto & App', 'Betreuung', 'Familie', 'Zeiten für Sachen', 'Urlaub', 'Mitnehmen beim Arzt', 'Eigene Sachen', 'Kontostand', 'Verlauf']);
  for (const id of KLAPPT) {
    await expect(zeile(page, id)).toHaveAttribute('aria-controls', `menue-${id}`);
    await expect(zeile(page, id)).toHaveAttribute('aria-expanded', 'false');
    await expect(tafel(page, id)).toBeHidden();
  }
  for (const id of ['app', 'verlauf']) await expect(zeile(page, id)).not.toHaveAttribute('aria-expanded');
  await expect(zeile(page, 'app')).toContainText('Mit Google verbinden, Darstellung, Sicherung');
  await expect(page.locator('.menue-status')).toHaveCount(0); // in der Demo kein Verbindungsstatus
});

test('Intro beim Betreten: alle neun Symbole spielen ihre eigene Animation, nacheinander', async ({ page }) => {
  await starteDemo(page, { route: '#/heute' });
  await tab(page, 'Mehr');
  await expect(symbole(page)).toHaveCount(9);
  await expect(page.locator('.menue-symbol.spielt')).toHaveCount(9);
  expect(await animationen(page)).toEqual(ANIMATIONEN);
  const verzoegerungen = await symbole(page).evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).animationDelay)));
  expect(verzoegerungen).toEqual([0.15, 0.26, 0.37, 0.48, 0.59, 0.7, 0.81, 0.92, 1.03]);
  const dauer = await symbole(page).first().evaluate((el) => getComputedStyle(el).animationDuration);
  expect(dauer).toBe('0.9s');
  // die Animationen laufen wirklich (Web Animations API) und enden von selbst
  const laufend = await page.evaluate(() => document.getAnimations().filter((a) => a.effect?.target?.classList?.contains('menue-symbol')).map((a) => a.animationName));
  expect(laufend.sort()).toEqual([...ANIMATIONEN].sort());
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((a) => a.effect?.target?.classList?.contains('menue-symbol') && a.playState === 'running').length), { timeout: 5000 }).toBe(0);
});

test('Zeile auf- und zuklappen', async ({ page }) => {
  await starteDemo(page, { route: '#/mehr' });
  await zeile(page, 'betreuung').click();
  await expect(zeile(page, 'betreuung')).toHaveAttribute('aria-expanded', 'true');
  await expect(eintrag(page, 'betreuung')).toHaveClass(/offen/);
  await expect(tafel(page, 'betreuung')).toBeVisible();
  await expect(tafel(page, 'betreuung').locator('.chip')).toHaveText(['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']);
  await zeile(page, 'betreuung').click();
  await expect(zeile(page, 'betreuung')).toHaveAttribute('aria-expanded', 'false');
  await expect(tafel(page, 'betreuung')).toBeHidden();
});

test('immer nur eine Zeile offen', async ({ page }) => {
  await starteDemo(page, { route: '#/mehr' });
  for (const id of KLAPPT) {
    await zeile(page, id).click();
    await expect(tafel(page, id)).toBeVisible();
    await expect(page.locator('.menue-inhalt:not([hidden])')).toHaveCount(1);
    await expect(page.locator('.menue-zeile[aria-expanded="true"]')).toHaveCount(1);
  }
});

test('nach dem Speichern bleibt die Zeile offen und das Intro spielt nicht noch einmal', async ({ page }) => {
  await starteDemo(page, { route: '#/mehr' });
  await zeile(page, 'betreuung').click();
  const sa = tafel(page, 'betreuung').locator('.chip', { hasText: /^Sa$/ });
  await expect(sa).not.toHaveClass(/aktiv/);
  await sa.click();
  await erwarteToast(page, 'Gespeichert ✓');
  // neu gezeichnet: der Chip ist jetzt aktiv, die Zeile weiter offen
  await expect(tafel(page, 'betreuung').locator('.chip', { hasText: /^Sa$/ })).toHaveClass(/aktiv/);
  await expect(zeile(page, 'betreuung')).toHaveAttribute('aria-expanded', 'true');
  await expect(tafel(page, 'betreuung')).toBeVisible();
  await expect(page.locator('.menue-symbol.spielt')).toHaveCount(0);
  expect(await animationen(page)).toEqual(Array(9).fill('none'));
  // ein Tipp auf eine Zeile spielt nur deren Symbol
  await zeile(page, 'familie').click();
  await expect(page.locator('.menue-symbol.spielt')).toHaveCount(1);
  await expect(eintrag(page, 'familie').locator('.menue-symbol')).toHaveClass(/spielt/);
  expect(await eintrag(page, 'familie').locator('.menue-symbol').evaluate((el) => getComputedStyle(el).animationName)).toBe('m-wiegen');
  // Wochentag wieder entfernen: auch das bleibt in der offenen Zeile sichtbar
  await zeile(page, 'betreuung').click();
  await tafel(page, 'betreuung').locator('.chip', { hasText: /^Sa$/ }).click();
  await expect(tafel(page, 'betreuung').locator('.chip', { hasText: /^Sa$/ })).not.toHaveClass(/aktiv/);
  await expect(tafel(page, 'betreuung')).toBeVisible();
});

test('die offene Zeile übersteht auch Wechsel der Seite; beim Zurückkommen spielt das Intro wieder', async ({ page }) => {
  await starteDemo(page, { route: '#/mehr' });
  await zeile(page, 'zeiten').click();
  await tab(page, 'Monat');
  await tab(page, 'Mehr');
  await expect(tafel(page, 'zeiten')).toBeVisible();
  await expect(page.locator('.menue-symbol.spielt')).toHaveCount(9);
});

test.describe('reduzierte Bewegung', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('keine Animationen beim Betreten und beim Aufklappen', async ({ page }) => {
    await starteDemo(page, { route: '#/mehr' });
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
    await expect(page.locator('.menue-symbol.spielt')).toHaveCount(9); // die Klasse kommt, die Bewegung nicht
    expect(await animationen(page)).toEqual(Array(9).fill('none'));
    await zeile(page, 'urlaub').click();
    await expect(tafel(page, 'urlaub')).toBeVisible();
    expect(await tafel(page, 'urlaub').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  });
});

test('ohne reduzierte Bewegung klappt der Inhalt animiert auf', async ({ page }) => {
  await starteDemo(page, { route: '#/mehr' });
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(false);
  await zeile(page, 'urlaub').click();
  expect(await tafel(page, 'urlaub').evaluate((el) => getComputedStyle(el).animationName)).toBe('menue-auf');
});

test('Wege: Konto & App, Verlauf und Kontostand – und zurück', async ({ page }) => {
  await starteDemo(page, { route: '#/mehr' });
  await zeile(page, 'app').click();
  await expect(page).toHaveURL(/#\/app$/);
  await expect(page).toHaveTitle('Familienkalender · Konto & App');
  await page.getByRole('button', { name: '‹ Zurück' }).click();
  await expect(page).toHaveURL(/#\/mehr$/);

  await zeile(page, 'verlauf').click();
  await expect(page).toHaveURL(/#\/verlauf$/);
  await expect(page.getByRole('heading', { name: 'Verlauf 📜' })).toBeVisible();
  await page.getByRole('button', { name: '‹ Zurück' }).click();
  await expect(page).toHaveURL(/#\/mehr$/);

  await zeile(page, 'kontostand').click();
  await expect(tafel(page, 'kontostand')).toContainText('Zuletzt (September 2026): +1.933,50 € zusammen.');
  await tafel(page, 'kontostand').getByRole('button', { name: 'Kontostand öffnen' }).click();
  await expect(page).toHaveURL(/#\/konto$/);
  await page.getByRole('button', { name: '‹ Zurück' }).click();
  await expect(page).toHaveURL(/#\/mehr$/);
  await expect(page.locator('nav.tabs a[aria-current="page"]')).toHaveText(/Mehr/);
});

test('Familie: Name des Kindes erscheint bei „Für wen“; ungültige Zeichen werden abgelehnt', async ({ page }) => {
  await starteDemo(page, { route: '#/mehr' });
  await zeile(page, 'familie').click();
  const name = tafel(page, 'familie').getByRole('textbox', { name: 'Name des Kindes' });
  await name.fill('Iris, Max');
  await name.press('Enter');
  await name.blur();
  await erwarteToast(page, 'Bitte ohne Klammern, Kommas und „ · “.');
  await name.fill('Iris');
  await name.blur();
  await erwarteToast(page, 'Gespeichert ✓');
  await expect(tafel(page, 'familie')).toBeVisible();
  await expect(name).toHaveValue('Iris');
  await tab(page, 'Neu');
  await page.locator('.kachel').filter({ hasText: 'Arzttermin' }).click();
  await expect(page.locator('.chip.aktiv').filter({ hasText: '🧒' })).toHaveText('🧒 Iris');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await erwarteToast(page, 'Termin gespeichert ✓');
  await page.goto('/#/verlauf');
  await expect(page.getByRole('button', { name: 'Kinderarzt (Iris), Mi 14. Okt. · 09:00' })).toBeVisible();
});

test('Vorschau im Arzttermin nennt den Namen des Kindes aus den Einstellungen', async ({ page }) => {
  await starteDemo(page, { route: '#/mehr' });
  await zeile(page, 'familie').click();
  await tafel(page, 'familie').getByRole('textbox', { name: 'Name des Kindes' }).fill('Iris');
  await tafel(page, 'familie').getByRole('textbox', { name: 'Name des Kindes' }).blur();
  await erwarteToast(page, 'Gespeichert ✓');
  await tab(page, 'Neu');
  await page.locator('.kachel').filter({ hasText: 'Arzttermin' }).click();
  await expect(page.locator('.vorschau b')).toHaveText('🩺 Kinderarzt (Iris) 09:00 · 🎒 e-card, MuKi-Pass, Impfpass');
});

test('Mitnehmen beim Arzt: Liste ergänzen und zurücksetzen', async ({ page }) => {
  await starteDemo(page, { route: '#/mehr' });
  await zeile(page, 'mitnehmen').click();
  const gruppe = tafel(page, 'mitnehmen').locator('details.gruppe').filter({ hasText: 'Mutter-Kind-Pass' });
  await gruppe.locator('summary').click();
  await expect(gruppe.locator('.chip')).toHaveText(['e-card✕', 'MuKi-Pass✕']);
  const feld = gruppe.getByRole('textbox');
  await feld.fill('Trinkflasche');
  await feld.press('Enter');
  await erwarteToast(page, 'Gespeichert ✓');
  const neu = tafel(page, 'mitnehmen').locator('details.gruppe').filter({ hasText: 'Mutter-Kind-Pass' });
  await expect(neu).toHaveAttribute('open', '');
  await expect(neu.locator('summary')).toHaveText('📒 Mutter-Kind-Pass · angepasst');
  await expect(neu.locator('.chip')).toHaveText(['e-card✕', 'MuKi-Pass✕', 'Trinkflasche✕']);
  await neu.getByRole('button', { name: 'Zurücksetzen' }).click();
  await erwarteToast(page, 'Zurückgesetzt ✓');
  await expect(tafel(page, 'mitnehmen').locator('details.gruppe').filter({ hasText: 'Mutter-Kind-Pass' }).locator('.chip')).toHaveCount(2);
});
