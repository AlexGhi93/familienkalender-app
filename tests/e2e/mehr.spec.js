// „Mehr“: Menü mit elf Zeilen und animierten Symbolen, Akkordeon (immer nur eine Zeile offen), Speichern ohne Zuklappen und ohne
// neues Intro, reduzierte Bewegung, Wege zu „Konto & App“, „Verlauf“ und „Kontostand“; getippte Uhrzeit und getipptes Datum
// werden mit Enter bzw. beim Verlassen des Feldes gespeichert.
import { test, expect, starteDemo, tab, erwarteToast } from './hilfen.js';

const IDS = ['app', 'betreuung', 'familie', 'nachrichten', 'zeiten', 'bringen', 'urlaub', 'mitnehmen', 'sachen', 'kontostand', 'verlauf'];
const TITEL = ['Konto & App', 'Betreuung', 'Familie', 'Nachrichten', 'Zeiten für Sachen', 'Bringen & Abholen', 'Urlaub', 'Mitnehmen beim Arzt', 'Eigene Sachen', 'Kontostand', 'Verlauf'];
const SYMBOLE = ['👤', '📅', '👶', '📨', '⏰', '🚗', '✈️', '🩺', '🎒', '💶', '📜'];
const ANIMATIONEN = ['m-nicken', 'm-blatt', 'm-wiegen', 'm-brief', 'm-klingeln', 'm-auto', 'm-fliegen', 'm-herz', 'm-huepfen', 'm-muenze', 'm-rolle'];
const KLAPPT = ['betreuung', 'familie', 'nachrichten', 'zeiten', 'bringen', 'urlaub', 'mitnehmen', 'sachen', 'kontostand'];
const N = IDS.length;

// Hier geht es um die Bewegung: anders als in den übrigen Tests (siehe playwright.config.js) ohne „reduzierte Bewegung“.
test.use({ contextOptions: { reducedMotion: 'no-preference' } });

const eintrag = (page, id) => page.locator(`.menue-eintrag[data-id="${id}"]`);
const zeile = (page, id) => eintrag(page, id).locator('.menue-zeile');
const tafel = (page, id) => page.locator(`#menue-${id}`);
const symbole = (page) => page.locator('.menue-symbol');
const animationen = (page) => symbole(page).evaluateAll((els) => els.map((el) => getComputedStyle(el).animationName));

test('Aufbau: elf Zeilen, neun klappen auf, zwei führen weiter', async ({ page }) => {
  await starteDemo(page, { route: '#/mehr' });
  await expect(page).toHaveTitle('Familienkalender · Mehr');
  await expect(page.locator('.menue-eintrag')).toHaveCount(N);
  expect(await page.locator('.menue-eintrag').evaluateAll((els) => els.map((el) => el.dataset.id))).toEqual(IDS);
  await expect(page.locator('.menue-text b')).toHaveText(TITEL);
  await expect(symbole(page)).toHaveText(SYMBOLE);
  await expect(zeile(page, 'nachrichten')).toContainText('Kontakt der Krabbelstube, Anrede, Gruß, Unterschrift');
  await expect(zeile(page, 'bringen')).toContainText('Wer bringt, wer holt – je Wochentag');
  await expect(zeile(page, 'betreuung')).toContainText('Wochentage, Erfassung, Kindergarten, Essensgeld');
  for (const id of KLAPPT) {
    await expect(zeile(page, id)).toHaveAttribute('aria-controls', `menue-${id}`);
    await expect(zeile(page, id)).toHaveAttribute('aria-expanded', 'false');
    await expect(tafel(page, id)).toBeHidden();
  }
  for (const id of ['app', 'verlauf']) await expect(zeile(page, id)).not.toHaveAttribute('aria-expanded');
  await expect(zeile(page, 'app')).toContainText('Mit Google verbinden, Darstellung, Sicherung');
  await expect(page.locator('.menue-status')).toHaveCount(0); // in der Demo kein Verbindungsstatus
});

test('Intro beim Betreten: alle elf Symbole spielen ihre eigene Animation, nacheinander', async ({ page }) => {
  await starteDemo(page, { route: '#/heute' });
  await tab(page, 'Mehr');
  await expect(symbole(page)).toHaveCount(N);
  await expect(page.locator('.menue-symbol.spielt')).toHaveCount(N);
  expect(await animationen(page)).toEqual(ANIMATIONEN);
  expect(new Set(ANIMATIONEN).size).toBe(N); // jede Zeile hat ihre eigene Bewegung
  const verzoegerungen = await symbole(page).evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).animationDelay)));
  expect(verzoegerungen).toEqual([0.15, 0.26, 0.37, 0.48, 0.59, 0.7, 0.81, 0.92, 1.03, 1.14, 1.25]);
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
  expect(await animationen(page)).toEqual(Array(N).fill('none'));
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
  await expect(page.locator('.menue-symbol.spielt')).toHaveCount(N);
});

test.describe('reduzierte Bewegung', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('keine Animationen beim Betreten und beim Aufklappen', async ({ page }) => {
    await starteDemo(page, { route: '#/mehr' });
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
    await expect(page.locator('.menue-symbol.spielt')).toHaveCount(N); // die Klasse kommt, die Bewegung nicht
    expect(await animationen(page)).toEqual(Array(N).fill('none'));
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

  // „Kontostand“ ist eine Registerkarte: ohne „Zurück“, zurück geht es über die Tab-Leiste; die Zeile ist dann noch offen
  await zeile(page, 'kontostand').click();
  await expect(tafel(page, 'kontostand')).toContainText('Zuletzt (September 2026): +1.933,50 € zusammen.');
  await tafel(page, 'kontostand').getByRole('button', { name: 'Kontostand öffnen' }).click();
  await expect(page).toHaveURL(/#\/konto$/);
  await expect(page.locator('nav.tabs a[aria-current="page"]')).toHaveText(/Konto/);
  await expect(page.getByRole('button', { name: '‹ Zurück' })).toHaveCount(0);
  await tab(page, 'Mehr');
  await expect(page).toHaveURL(/#\/mehr$/);
  await expect(page.locator('nav.tabs a[aria-current="page"]')).toHaveText(/Mehr/);
  await expect(tafel(page, 'kontostand')).toBeVisible();
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

/** Einstellungen aus dem Speicher der Demo (was wirklich gespeichert wurde). */
const gespeichert = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('fk.demo.v1')).settings);

test('Zeiten für Sachen: eine fertig getippte Uhrzeit wird mit Enter gespeichert, beim Verlassen ebenso', async ({ page }) => {
  await starteDemo(page, { route: '#/mehr' });
  await zeile(page, 'zeiten').click();
  const hin = tafel(page, 'zeiten').getByRole('textbox', { name: 'Hinbringen um', exact: true });
  await expect(hin).toHaveValue('07:30');
  // Ein Tipp markiert den alten Wert, dann Ziffern wie auf der Zifferntastatur: „0815“ wird beim Tippen zu „08:15“,
  // gespeichert wird erst mit Enter
  await hin.click();
  await expect.poll(() => hin.evaluate((el) => [el.selectionStart, el.selectionEnd])).toEqual([0, 5]);
  await hin.pressSequentially('0815');
  await expect(hin).toHaveValue('08:15');
  await expect(hin).toBeFocused();
  await hin.press('Enter');
  await erwarteToast(page, 'Gespeichert ✓');
  await expect.poll(async () => (await gespeichert(page)).bringzeit).toBe('08:15');
  await expect(tafel(page, 'zeiten')).toBeVisible(); // nach dem Neuzeichnen weiter offen, mit dem neuen Wert
  await expect(tafel(page, 'zeiten').getByRole('textbox', { name: 'Hinbringen um', exact: true })).toHaveValue('08:15');

  // „Heimholen um“: fertig getippt und dann einfach das Feld verlassen
  const heim = tafel(page, 'zeiten').getByRole('textbox', { name: 'Heimholen um', exact: true });
  await heim.fill('16:45');
  await heim.blur();
  await erwarteToast(page, 'Gespeichert ✓');
  await expect.poll(async () => (await gespeichert(page)).abholzeit).toBe('16:45');

  // bleibt nach dem Neuladen, und neue Sachen beginnen mit der neuen Uhrzeit
  await page.reload();
  await zeile(page, 'zeiten').click();
  await expect(tafel(page, 'zeiten').getByRole('textbox', { name: 'Hinbringen um', exact: true })).toHaveValue('08:15');
  await expect(tafel(page, 'zeiten').getByRole('textbox', { name: 'Heimholen um', exact: true })).toHaveValue('16:45');
  await tab(page, 'Neu');
  await page.locator('.kachel').filter({ hasText: 'Sachen für Krabbelstube' }).click();
  await expect(page.getByRole('textbox', { name: 'Uhrzeit', exact: true })).toHaveValue('08:15');
});

test('Zeiten für Sachen: ungültige Uhrzeit wird gemeldet und nicht gespeichert; Vorabend lässt sich leeren', async ({ page }) => {
  await starteDemo(page, { route: '#/mehr' });
  await zeile(page, 'zeiten').click();
  const hin = tafel(page, 'zeiten').getByRole('textbox', { name: 'Hinbringen um', exact: true });
  await hin.fill('25:99');
  await hin.press('Enter');
  await erwarteToast(page, 'Bitte eine Uhrzeit eingeben, z. B. 07:30.');
  await expect(hin).toHaveAttribute('aria-invalid', 'true');
  expect((await gespeichert(page)).bringzeit).toBe('07:30');

  const vorabend = tafel(page, 'zeiten').getByRole('textbox', { name: 'Erinnerung am Vorabend', exact: true });
  await expect(vorabend).toHaveValue('18:00');
  await vorabend.fill('');
  await vorabend.press('Enter');
  await erwarteToast(page, 'Gespeichert ✓');
  await expect.poll(async () => (await gespeichert(page)).vorabend).toBe(''); // leer = keine Erinnerung am Vorabend
});

test('Betreuung: getipptes Datum wird mit Enter gespeichert („Wechsel zum Kindergarten ab“ wirkt sofort)', async ({ page }) => {
  await starteDemo(page, { route: '#/mehr' });
  await zeile(page, 'betreuung').click();
  const wechsel = tafel(page, 'betreuung').getByRole('textbox', { name: 'Wechsel zum Kindergarten ab', exact: true });
  await expect(wechsel).toHaveValue('');
  await wechsel.fill('14102026'); // acht Ziffern bekommen beim Tippen die Punkte
  await expect(wechsel).toHaveValue('14.10.2026');
  await wechsel.press('Enter');
  await erwarteToast(page, 'Gespeichert ✓');
  await expect.poll(async () => (await gespeichert(page)).wechseldatum).toBe('2026-10-14');
  await expect(tafel(page, 'betreuung').getByRole('textbox', { name: 'Wechsel zum Kindergarten ab', exact: true })).toHaveValue('14.10.2026');
  await expect(tafel(page, 'betreuung').locator('.eingabe-hinweis').nth(1)).toHaveText('Mittwoch, 14. Oktober');
  await expect(zeile(page, 'nachrichten')).toContainText('Kontakt des Kindergartens');
  await tab(page, 'Heute');
  await expect(page.locator('.kopf .pille')).toHaveText('Kindergarten');

  // „Erfassung ab“ ohne Jahr: „1.9.“ gilt im laufenden Jahr
  await tab(page, 'Mehr');
  const ab = tafel(page, 'betreuung').getByRole('textbox', { name: 'Erfassung ab', exact: true });
  await ab.fill('1.9.');
  await ab.press('Enter');
  await erwarteToast(page, 'Gespeichert ✓');
  await expect.poll(async () => (await gespeichert(page)).erfassungAb).toBe('2026-09-01');
  await expect(tafel(page, 'betreuung').getByRole('textbox', { name: 'Erfassung ab', exact: true })).toHaveValue('01.09.2026');
});
