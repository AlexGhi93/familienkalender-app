// Schichtplan (Demo): Registerkarte „Schicht“, Monatsraster mit zwei Streifen je Tag (oben Papa, unten Mama), Monatswechsel,
// Filter (gemerkt auf diesem Telefon), Zählung und Legende; auf 375 px ragt nichts hinaus.
import { test, expect, starteDemo, starteGoogleAusSnapshot, tab, NETZFEHLER } from './hilfen.js';

const zelle = (page, datum) => page.locator(`.sp-zelle[data-datum="${datum}"]`);
const streifen = (page, datum, person) => zelle(page, datum).locator(`.sp-streifen.${person}`);
const monatTitel = (page) => page.locator('.sp-monat h2');

test('„Schicht“ zwischen „Neu“ und „Urlaub“ öffnet den Schichtplan mit den Beispielschichten des Monats', async ({ page }) => {
  await starteDemo(page);
  const texte = await page.locator('nav.tabs .tab-text').allTextContents();
  expect(texte.slice(texte.indexOf('Neu'), texte.indexOf('Neu') + 3)).toEqual(['Neu', 'Schicht', 'Urlaub']);
  await tab(page, 'Schicht');
  await expect(page).toHaveURL(/#\/schicht$/);
  await expect(page).toHaveTitle('Familienkalender · Schichtplan');
  await expect(page.getByRole('heading', { name: '🗓️ Schichtplan' })).toBeVisible();
  await expect(page.getByRole('button', { name: '✏️ Eintragen' })).toBeVisible();
  await expect(monatTitel(page)).toHaveText('Oktober 2026');
  // Oktober 2026 beginnt am Donnerstag: drei leere Felder davor
  await expect(page.locator('.sp-raster > .sp-leer-feld').first()).toBeVisible();
  await expect(page.locator('.sp-zelle')).toHaveCount(31);
  // Beispieldaten: 1.10. Papa Nacht (☾), 2.10. Mama Nacht, 5.10. Papa Frühdienst, 6.10. Mama Tagdienst
  await expect(streifen(page, '2026-10-01', 'papa')).toHaveText('N☾');
  await expect(streifen(page, '2026-10-01', 'papa')).toHaveClass(/sf-dunkelblau/);
  await expect(streifen(page, '2026-10-01', 'mama')).toHaveClass(/leer/);
  await expect(streifen(page, '2026-10-02', 'mama')).toHaveText('N☾');
  await expect(streifen(page, '2026-10-05', 'papa')).toHaveText('F');
  await expect(streifen(page, '2026-10-05', 'papa')).toHaveClass(/sf-gruen/);
  await expect(streifen(page, '2026-10-06', 'mama')).toHaveText('T');
  await expect(zelle(page, '2026-10-13').locator('.sp-notiz')).toHaveText('✎');
  await expect(zelle(page, '2026-10-21').locator('.sp-zusatz')).toHaveText('DB');
  await expect(zelle(page, '2026-10-14')).toHaveClass(/heute/);
  await expect(zelle(page, '2026-10-26').locator('.sp-feiertag')).toBeVisible();
  await expect(zelle(page, '2026-10-05')).toHaveAttribute('aria-label', 'Montag, 5. Oktober: Papa Frühdienst, Mama frei');
  // Zählung und Legende
  await expect(page.locator('.sp-zaehlung')).toContainText('👨 Papa');
  await expect(page.locator('.sp-zaehlung')).toContainText(/\d+ Dienste · \d+× F/);
  await expect(page.locator('.sp-legende')).toContainText('Frühdienst');
  await expect(page.locator('.sp-legende')).toContainText('Tagdienst 07:00–17:45');
  await expect(page.getByRole('button', { name: 'Schichtarten bearbeiten' })).toBeVisible();
});

test('‹ und › wechseln den Monat (auch übers Jahr)', async ({ page }) => {
  await starteDemo(page, { route: '#/schicht' });
  await expect(monatTitel(page)).toHaveText('Oktober 2026');
  await page.getByRole('button', { name: 'Nächster Monat' }).click();
  await expect(monatTitel(page)).toHaveText('November 2026');
  await expect(streifen(page, '2026-11-10', 'mama')).toHaveText('U'); // Beispiel: Mama Urlaub 10.–12.11.
  await expect(streifen(page, '2026-11-10', 'mama')).toHaveClass(/urlaub/);
  await page.getByRole('button', { name: 'Nächster Monat' }).click();
  await page.getByRole('button', { name: 'Nächster Monat' }).click();
  await expect(monatTitel(page)).toHaveText('Januar 2027');
  await expect(page.locator('.sp-zelle')).toHaveCount(31);
  await expect(page.locator('.sp-zaehlung')).toContainText('Noch nichts eingetragen');
  for (let i = 0; i < 4; i += 1) await page.getByRole('button', { name: 'Vorheriger Monat' }).click();
  await expect(monatTitel(page)).toHaveText('September 2026');
  await expect(page.locator('.sp-zelle .sp-streifen.papa:not(.leer)').first()).toBeVisible();
});

test('Filter „👨 Papa“ blendet Mama aus und bleibt nach dem Neuladen', async ({ page }) => {
  await starteDemo(page, { route: '#/schicht' });
  await expect(page.getByRole('button', { name: 'Beide' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.sp-streifen.mama').first()).toBeVisible();
  await page.getByRole('button', { name: '👨 Papa' }).click();
  await expect(page.getByRole('button', { name: '👨 Papa' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.sp-streifen.mama')).toHaveCount(0);
  await expect(page.locator('.sp-streifen.papa')).toHaveCount(31);
  await expect(page.locator('.sp-raster')).toHaveClass(/eine-person/); // ein Streifen, doppelt so hoch
  await expect(page.locator('.sp-zaehlung')).not.toContainText('Mama');
  await expect(page.locator('.sp-legende')).not.toContainText('Tagdienst');
  await page.reload();
  await expect(page.getByRole('button', { name: '👨 Papa' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.sp-streifen.papa').first()).toBeVisible();
  await expect(page.locator('.sp-streifen.mama')).toHaveCount(0);
  await page.getByRole('button', { name: '👩 Mama' }).click();
  await expect(page.locator('.sp-streifen.papa')).toHaveCount(0);
  await expect(page.locator('.sp-legende')).toContainText('Tagdienst 07:00–17:45');
  await page.getByRole('button', { name: 'Beide' }).click();
  await expect(page.locator('.sp-streifen.papa')).toHaveCount(31);
  await expect(page.locator('.sp-streifen.mama')).toHaveCount(31);
});

test.describe('Telefon mit 375 px Breite', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('sieben Spalten passen, kein Kürzel wird abgeschnitten, die Seite scrollt nicht seitwärts', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await expect(streifen(page, '2026-10-05', 'papa')).toHaveText('F');
    const masse = await page.evaluate(() => {
      const zellen = [...document.querySelectorAll('.sp-zelle')].map((z) => z.getBoundingClientRect());
      const streifen = [...document.querySelectorAll('.sp-streifen:not(.leer)')];
      return {
        seite: document.documentElement.scrollWidth,
        breiten: zellen.map((r) => r.width),
        rechts: Math.max(...zellen.map((r) => r.right)),
        links: Math.min(...zellen.map((r) => r.left)),
        abgeschnitten: streifen.filter((s) => s.scrollWidth > s.clientWidth + 0.5).map((s) => s.textContent),
        streifenHoehe: streifen[0].getBoundingClientRect().height,
      };
    });
    expect(masse.seite).toBe(375);
    for (const b of masse.breiten) expect(b).toBeGreaterThan(40);
    expect(masse.links).toBeGreaterThanOrEqual(0);
    expect(masse.rechts).toBeLessThanOrEqual(375);
    expect(masse.abgeschnitten).toEqual([]);
    expect(masse.streifenHoehe).toBeGreaterThanOrEqual(16);
  });

  test('ein voller Tag (Feiertag, DB+2, Notiz) bleibt in seinem Feld; Kürzel und „+2“ bleiben sichtbar', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await expect(zelle(page, '2026-10-26')).toBeVisible();
    // 26.10. (Nationalfeiertag): Mama drei Dienstbesprechungen und eine Notiz – direkt im Speicher der Demo, dann neu laden
    await page.evaluate(() => {
      const daten = JSON.parse(localStorage.getItem('fk.demo.v1'));
      const monat = daten.schicht.monate['2026-10'];
      const db = daten.schicht.katalog?.arten?.mama?.find((a) => a.kuerzel === 'DB')?.k ?? 'F';
      monat.z.mama['26'] = [['07:00', '08:00'], ['12:00', '13:00'], ['18:00', '19:30']].map(([von, bis]) => ({ k: db, von, bis }));
      monat.n.mama['26'] = 'Viel los';
      localStorage.setItem('fk.demo.v1', JSON.stringify(daten));
    });
    await page.reload();
    const kopf = zelle(page, '2026-10-26').locator('.sp-zkopf');
    await expect(kopf.locator('.sp-zusatz')).toHaveText('DB');
    await expect(kopf.locator('.sp-mehr')).toHaveText('+2');
    await expect(kopf.locator('.sp-notiz')).toHaveText('✎');
    await expect(kopf.locator('.sp-feiertag')).toBeVisible();
    await expect(zelle(page, '2026-10-26')).toHaveAttribute('aria-label', /Nationalfeiertag: .*Zusatz DB und 2 weitere, mit Notiz$/);
    const masse = await zelle(page, '2026-10-26').evaluate((z) => {
      const r = (el) => el.getBoundingClientRect();
      const k = z.querySelector('.sp-zkopf');
      const innen = { links: r(z).left + z.clientLeft, rechts: r(z).left + z.clientLeft + z.clientWidth };
      return {
        ueberlauf: k.scrollWidth - k.clientWidth,
        kopf: { links: r(k).left, rechts: r(k).right },
        innen,
        teile: ['.nr', '.sp-zusatz', '.sp-mehr'].map((s) => ({ s, links: r(k.querySelector(s)).left, rechts: r(k.querySelector(s)).right })),
      };
    });
    expect(masse.ueberlauf).toBeLessThanOrEqual(0);
    expect(masse.kopf.links).toBeGreaterThanOrEqual(masse.innen.links - 0.5);
    expect(masse.kopf.rechts).toBeLessThanOrEqual(masse.innen.rechts + 0.5);
    for (const t of masse.teile) {
      expect(t.links, t.s).toBeGreaterThanOrEqual(masse.kopf.links - 0.5);
      expect(t.rechts, t.s).toBeLessThanOrEqual(masse.kopf.rechts + 0.5);
    }
  });
});

test.describe('ohne Verbindung', () => {
  test.use({ erlaubteFehler: NETZFEHLER });

  test('ein nie geladener Monat zeigt „Noch nicht geladen – bitte verbinden.“ statt leerer Tage', async ({ page }) => {
    await starteGoogleAusSnapshot(page, { route: '#/schicht' });
    await expect(page.getByText('Noch nicht geladen – bitte verbinden.')).toBeVisible();
    await expect(page.locator('.sp-zelle')).toHaveCount(0);
    await expect(page.locator('.sp-legende')).toContainText('Frühdienst');
  });
});
