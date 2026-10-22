// Schichtplan mit Google (Attrappe der Kalender-API, siehe hilfen.js): erst die Seite liest die versteckten Ereignisse
// „fkschichtarten“ und „fksch<JJJJMM>“ (drei Monate), der Pinsel schreibt den Monat als JSON ohne Inhalt im Titel,
// Monat und Verlauf zeigen davon nichts, und ohne Netz zeigt die Offline-Kopie besuchte Monate, unbesuchte nicht.
import { test, expect, starteGoogleVerbunden, tab, NETZFEHLER } from './hilfen.js';
import { schichtartenZuEreignis, schichtMonatZuEreignis } from '../../src/calendar/mapping.js';
import { leererMonat, setzeNotiz, setzeSchicht, standardKatalog, MAX_SCHICHT_ZEICHEN } from '../../src/domain/schicht.js';

test.use({ viewport: { width: 375, height: 812 }, erlaubteFehler: NETZFEHLER }); // fehlende versteckte Ereignisse antworten 404

const zelle = (page, datum) => page.locator(`.sp-zelle[data-datum="${datum}"]`);
const streifen = (page, datum, person) => zelle(page, datum).locator(`.sp-streifen.${person}`);
const monatTitel = (page) => page.locator('.sp-monat h2');
const leiste = (page) => page.locator('.sp-pinsel');
/** Gelesene Schicht-Ereignisse, ohne Kalender-ID: 'GET fksch202610'. */
const schichtGelesen = (google) => google.anfragen.filter((a) => a.startsWith('GET ') && a.includes('/events/fksch')).map((a) => a.replace(/ \/calendars\/[^/]+\/events\//, ' '));
/** Geschriebene Schicht-Ereignisse: 'POST fksch202610', 'PATCH fksch202610'. */
const schichtGeschrieben = (google) => google.geschrieben.filter((a) => a.includes(' fksch'));
/** Interner Schlüssel einer Art nach ihrem Kürzel (Standardarten). */
const schluessel = (person, kuerzel) => standardKatalog().arten[person].find((a) => a.kuerzel === kuerzel).k;

/** Oktober 2026 bei Google: Papa Frühdienst am 5., Mama Notiz am 13. (erfunden). */
function oktoberBeiGoogle() {
  let m = leererMonat('2026-10');
  m = setzeSchicht(m, { person: 'papa', tag: 5, k: schluessel('papa', 'F') });
  m = setzeNotiz(m, { person: 'mama', tag: 13, text: 'Dienst 12' });
  return schichtMonatZuEreignis({ ...m, jm: '2026-10' }).body;
}

test('erst die Seite liest: Schichtarten und Vor-, laufender und Folgemonat (fkschichtarten, fksch202609–11); Gelesenes ist zu sehen', async ({ page }) => {
  const google = await starteGoogleVerbunden(page, { ereignisse: [oktoberBeiGoogle()] });
  expect(schichtGelesen(google), 'beim Start wird nichts vom Schichtplan gelesen').toEqual([]);

  await tab(page, 'Schicht');
  await expect(monatTitel(page)).toHaveText('Oktober 2026');
  await expect.poll(() => schichtGelesen(google).sort()).toEqual(['GET fksch202609', 'GET fksch202610', 'GET fksch202611', 'GET fkschichtarten']);
  await expect(page.locator('.sp-zelle')).toHaveCount(31);
  await expect(streifen(page, '2026-10-05', 'papa')).toHaveText('F');
  await expect(streifen(page, '2026-10-05', 'papa')).toHaveClass(/sf-gruen/);
  await expect(zelle(page, '2026-10-13').locator('.sp-notiz')).toHaveText('✎');
  await expect(page.locator('.sp-legende')).toContainText('Frühdienst'); // keine Schichtarten bei Google: die Standardarten
  expect(schichtGeschrieben(google), 'Lesen schreibt nichts').toEqual([]);

  // Monatswechsel zum Dezember liest 2026-12 und 2027-01 dazu
  await page.getByRole('button', { name: 'Nächster Monat' }).click();
  await page.getByRole('button', { name: 'Nächster Monat' }).click();
  await expect(monatTitel(page)).toHaveText('Dezember 2026');
  await expect.poll(() => schichtGelesen(google)).toEqual(expect.arrayContaining(['GET fksch202612', 'GET fksch202701']));
});

test('der Pinsel schreibt „fksch202610“: Titel ohne Inhalt, gültiges JSON ≤ 6000 Zeichen, versteckt am 01.01.2000 ohne Erinnerung', async ({ page }) => {
  const google = await starteGoogleVerbunden(page, { route: '#/schicht' });
  await expect(page.locator('.sp-zelle')).toHaveCount(31);
  await page.getByRole('button', { name: '✏️ Eintragen' }).click();
  await leiste(page).getByRole('button', { name: 'F Frühdienst', exact: true }).click();
  await zelle(page, '2026-10-08').click();
  await expect(streifen(page, '2026-10-08', 'papa')).toHaveText('F');
  await expect.poll(() => google.ereignis('fksch202610')?.description ?? null).not.toBeNull();
  await zelle(page, '2026-10-09').click();
  await leiste(page).getByRole('button', { name: '👩 Mama' }).click();
  await leiste(page).getByRole('button', { name: 'T Tagdienst', exact: true }).click();
  await zelle(page, '2026-10-09').click();
  await expect(streifen(page, '2026-10-09', 'mama')).toHaveText('T');
  await leiste(page).getByRole('button', { name: 'Fertig' }).click();

  const F = schluessel('papa', 'F');
  const T = schluessel('mama', 'T');
  await expect.poll(() => JSON.parse(google.ereignis('fksch202610').description).t).toEqual({
    papa: `.......${F}${F}......................`,
    mama: `........${T}......................`,
  });
  const e = google.ereignis('fksch202610');
  expect(e.summary).toBe('🗓️ fk Schichtplan (nicht löschen)');
  expect(e.description.length).toBeLessThanOrEqual(MAX_SCHICHT_ZEICHEN);
  expect(JSON.parse(e.description).v).toBe(1);
  expect(e.start).toEqual({ date: '2000-01-01' });
  expect(e.end).toEqual({ date: '2000-01-02' });
  expect(e.transparency).toBe('transparent');
  expect(e.reminders).toEqual({ useDefault: false, overrides: [] });
  expect(e.extendedProperties.private).toMatchObject({ fk: '1', typ: 'schicht' });
  // Nichts aus dem Plan steht außerhalb der Beschreibung
  expect(JSON.stringify({ ...e, description: '' })).not.toMatch(/Papa|Mama|Frühdienst|Tagdienst/);
  // eingefügt einmal, danach nur geändert; nur dieser Monat, keine Schichtarten (es wurde keine Art geändert)
  const geschrieben = schichtGeschrieben(google);
  expect(geschrieben[0]).toBe('POST fksch202610');
  expect(geschrieben.length).toBeGreaterThan(1);
  expect(geschrieben.slice(1).every((a) => a === 'PATCH fksch202610'), geschrieben.join(', ')).toBe(true);
  expect(google.ereignis('fkschichtarten')).toBeNull();
});

test('versteckte Schicht-Ereignisse erscheinen nicht in Heute, Monat und Verlauf, auch wenn Google sie in Listen mitliefert', async ({ page }) => {
  const katalog = standardKatalog();
  await starteGoogleVerbunden(page, { ereignisse: [oktoberBeiGoogle(), schichtartenZuEreignis(katalog).body], listenMitAllen: true });
  await expect(page.locator('main')).not.toContainText(/fk Schicht|nicht löschen/);
  await tab(page, 'Monat');
  await expect(page.locator('main')).toContainText('Oktober 2026');
  await expect(page.locator('main')).not.toContainText(/fk Schicht|nicht löschen/);
  await page.evaluate(() => {
    location.hash = '#/verlauf';
  });
  await expect(page.getByRole('heading', { name: 'Verlauf 📜' })).toBeVisible();
  await expect(page.locator('main')).not.toContainText(/fk Schicht|nicht löschen/);
  await expect(page.locator('.verlauf-zeile')).toHaveCount(0);
  await expect(page.getByText('Noch keine Einträge.')).toBeVisible();
  await expect(page.locator('main')).not.toContainText(/fk Schicht|nicht löschen/);
  // … aber auf der eigenen Seite stehen sie
  await tab(page, 'Schicht');
  await expect(streifen(page, '2026-10-05', 'papa')).toHaveText('F');
});

test('nach dem Neuladen ohne Netz: der besuchte Monat aus der Offline-Kopie, ein unbesuchter „Noch nicht geladen – bitte verbinden.“', async ({ page }) => {
  const google = await starteGoogleVerbunden(page, { route: '#/schicht' });
  await expect(page.locator('.sp-zelle')).toHaveCount(31);
  await page.getByRole('button', { name: '✏️ Eintragen' }).click();
  await leiste(page).getByRole('button', { name: 'N Nacht', exact: true }).click();
  await zelle(page, '2026-10-08').click();
  await leiste(page).getByRole('button', { name: 'Fertig' }).click();
  const N = schluessel('papa', 'N');
  await expect.poll(() => google.ereignis('fksch202610')?.description ?? '').toContain(`.......${N}`);
  // die Offline-Kopie enthält den Oktober mit dem neuen Eintrag (sie wird kurz nach jeder Änderung gespeichert)
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('fk.snapshot.v1') ?? 'null')?.schicht?.monate?.['2026-10']?.t?.papa ?? ''))
    .toContain(`.......${N}`);

  // kein Netz mehr (neuere Routen gehen vor), dann neu laden
  await page.route(/accounts\.google\.com|googleapis\.com|workers\.dev/, (r) => r.abort());
  await page.reload();
  await expect(page.locator('nav.tabs')).toBeVisible();
  await expect(monatTitel(page)).toHaveText('Oktober 2026');
  await expect(streifen(page, '2026-10-08', 'papa')).toHaveText('N☾');
  await expect(page.getByText('Noch nicht geladen – bitte verbinden.')).toHaveCount(0);
  // November war als Folgemonat mitgeladen; Dezember nie
  await page.getByRole('button', { name: 'Nächster Monat' }).click();
  await expect(monatTitel(page)).toHaveText('November 2026');
  await expect(page.locator('.sp-zelle')).toHaveCount(30);
  await page.getByRole('button', { name: 'Nächster Monat' }).click();
  await expect(monatTitel(page)).toHaveText('Dezember 2026');
  await expect(page.getByText('Noch nicht geladen – bitte verbinden.')).toBeVisible();
  await expect(page.locator('.sp-zelle')).toHaveCount(0);
});
