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

test.describe('Pinsel', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  const leiste = (page) => page.locator('.sp-pinsel');
  const art = (page, name) => leiste(page).getByRole('button', { name, exact: true });

  test('„Eintragen“ öffnet die Leiste: Art wählen, Tage antippen, nochmal tippen löscht, „Frei“ und Zusatz DB; „Fertig“ schließt', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await expect(leiste(page)).toHaveCount(0);
    await page.getByRole('button', { name: '✏️ Eintragen' }).click();
    await expect(leiste(page)).toBeVisible();
    await expect(page.getByRole('button', { name: '✏️ Eintragen' })).toHaveAttribute('aria-pressed', 'true');
    // Papa aktiv, seine Arten in Katalog-Reihenfolge, dann „Frei“ und „Fertig“
    await expect(leiste(page).getByRole('button', { name: '👨 Papa' })).toHaveAttribute('aria-pressed', 'true');
    await expect(leiste(page).getByRole('button', { name: '👩 Mama' })).toHaveAttribute('aria-pressed', 'false');
    await expect(leiste(page).locator('.sp-pinsel-arten button')).toHaveText([
      'F Frühdienst',
      'M Mittagsdienst',
      'NM Nachmittagsdienst',
      'N Nacht',
      '2T 2Teiler',
      'Ü Überstunde',
      'S Schulung',
      'U Urlaub',
      '– Frei',
    ]);
    await expect(art(page, 'F Frühdienst').locator('.sp-pinsel-kuerzel')).toHaveClass(/sf-gruen/);
    await expect(leiste(page).getByRole('button', { name: 'Fertig' })).toBeVisible();

    // F auf zwei leere Tage (Papa frei am 8. und 9.10.), dann den 8. noch einmal → wieder frei
    await art(page, 'F Frühdienst').click();
    await expect(art(page, 'F Frühdienst')).toHaveAttribute('aria-pressed', 'true');
    await expect(streifen(page, '2026-10-08', 'papa')).toHaveClass(/leer/);
    await zelle(page, '2026-10-08').click();
    await zelle(page, '2026-10-09').click();
    await expect(streifen(page, '2026-10-08', 'papa')).toHaveText('F');
    await expect(streifen(page, '2026-10-09', 'papa')).toHaveText('F');
    await zelle(page, '2026-10-08').click();
    await expect(streifen(page, '2026-10-08', 'papa')).toHaveClass(/leer/);
    await expect(streifen(page, '2026-10-09', 'papa')).toHaveText('F');
    // ein anderer Dienst wird ersetzt: 10.10. Papa Nacht → F
    await zelle(page, '2026-10-10').click();
    await expect(streifen(page, '2026-10-10', 'papa')).toHaveText('F');

    // „Frei“ auf Papas Nacht am 1.10. → leer
    await expect(streifen(page, '2026-10-01', 'papa')).toHaveText('N☾');
    await art(page, '– Frei').click();
    await expect(art(page, '– Frei')).toHaveAttribute('aria-pressed', 'true');
    await zelle(page, '2026-10-01').click();
    await expect(streifen(page, '2026-10-01', 'papa')).toHaveClass(/leer/);
    await zelle(page, '2026-10-01').click(); // „Frei“ auf einem freien Tag bleibt frei
    await expect(streifen(page, '2026-10-01', 'papa')).toHaveClass(/leer/);

    // Mama: ihre Arten samt Zusatz DB; „Frei“ löscht den Dienst, Notiz und Zusatz bleiben
    await leiste(page).getByRole('button', { name: '👩 Mama' }).click();
    await expect(leiste(page).getByRole('button', { name: '👩 Mama' })).toHaveAttribute('aria-pressed', 'true');
    await expect(leiste(page).locator('.sp-pinsel-arten button')).toHaveText(['T Tagdienst', 'N Nachtdienst', 'S Schulung', 'Ü Überstunde', 'U Urlaub', 'DB Dienstbesprechung', '– Frei']);
    await art(page, '– Frei').click();
    await expect(streifen(page, '2026-10-13', 'mama')).toHaveText('T');
    await zelle(page, '2026-10-13').click();
    await expect(streifen(page, '2026-10-13', 'mama')).toHaveClass(/leer/);
    await expect(zelle(page, '2026-10-13').locator('.sp-notiz')).toHaveText('✎');
    await zelle(page, '2026-10-21').click();
    await expect(streifen(page, '2026-10-21', 'mama')).toHaveClass(/leer/);
    await expect(zelle(page, '2026-10-21').locator('.sp-zusatz')).toHaveText('DB');

    // DB: der erste Tipp fügt sie mit 18:00–19:30 hinzu, der zweite nimmt sie wieder weg; der Dienst des Tages bleibt
    await art(page, 'DB Dienstbesprechung').click();
    await expect(streifen(page, '2026-10-06', 'mama')).toHaveText('T');
    await expect(zelle(page, '2026-10-06').locator('.sp-zusatz')).toHaveCount(0);
    await zelle(page, '2026-10-06').click();
    await expect(zelle(page, '2026-10-06').locator('.sp-zusatz')).toHaveText('DB');
    await expect(streifen(page, '2026-10-06', 'mama')).toHaveText('T');
    const zusaetze = () => page.evaluate(() => JSON.parse(localStorage.getItem('fk.demo.v1')).schicht.monate['2026-10'].z.mama['6'] ?? null);
    await expect.poll(zusaetze).toEqual([{ k: expect.any(String), von: '18:00', bis: '19:30' }]);
    await zelle(page, '2026-10-06').click();
    await expect(zelle(page, '2026-10-06').locator('.sp-zusatz')).toHaveCount(0);
    await expect.poll(zusaetze).toBeNull();
    await zelle(page, '2026-10-07').click();
    await expect(zelle(page, '2026-10-07').locator('.sp-zusatz')).toHaveText('DB');

    // „Fertig“: Leiste zu, ein Tipp auf einen Tag trägt nichts mehr ein
    await leiste(page).getByRole('button', { name: 'Fertig' }).click();
    await expect(leiste(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: '✏️ Eintragen' })).toHaveAttribute('aria-pressed', 'false');
    await zelle(page, '2026-10-03').click();
    await expect(streifen(page, '2026-10-03', 'mama')).toHaveClass(/leer/);
    await expect(zelle(page, '2026-10-03').locator('.sp-zusatz')).toHaveCount(0);

    // nach dem Neuladen ist alles noch da (Demo-Speicher)
    await page.reload();
    await expect(streifen(page, '2026-10-09', 'papa')).toHaveText('F');
    await expect(streifen(page, '2026-10-08', 'papa')).toHaveClass(/leer/);
    await expect(streifen(page, '2026-10-10', 'papa')).toHaveText('F');
    await expect(streifen(page, '2026-10-01', 'papa')).toHaveClass(/leer/);
    await expect(streifen(page, '2026-10-13', 'mama')).toHaveClass(/leer/);
    await expect(zelle(page, '2026-10-13').locator('.sp-notiz')).toHaveText('✎');
    await expect(zelle(page, '2026-10-21').locator('.sp-zusatz')).toHaveText('DB');
    await expect(zelle(page, '2026-10-06').locator('.sp-zusatz')).toHaveCount(0);
    await expect(zelle(page, '2026-10-07').locator('.sp-zusatz')).toHaveText('DB');
    await expect(leiste(page)).toHaveCount(0);
  });

  test('Filter „👨 Papa“ und Pinsel auf Mama: beim Malen sind beide zu sehen, nach „Fertig“ wieder nur Papa (auch nach dem Neuladen)', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await page.locator('.sp-filter').getByRole('button', { name: '👨 Papa' }).click();
    await expect(page.locator('.sp-streifen.mama')).toHaveCount(0);
    await page.getByRole('button', { name: '✏️ Eintragen' }).click();
    await expect(leiste(page).getByRole('button', { name: '👨 Papa' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.sp-streifen.mama')).toHaveCount(0); // Pinsel auf Papa: der Filter passt, nichts ändert sich
    await leiste(page).getByRole('button', { name: '👩 Mama' }).click();
    await expect(page.locator('.sp-streifen.mama')).toHaveCount(31);
    await expect(page.locator('.sp-streifen.papa')).toHaveCount(31);
    await art(page, 'U Urlaub').click();
    await zelle(page, '2026-10-08').click();
    await expect(streifen(page, '2026-10-08', 'mama')).toHaveText('U');
    await leiste(page).getByRole('button', { name: 'Fertig' }).click();
    await expect(page.locator('.sp-filter').getByRole('button', { name: '👨 Papa' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.sp-streifen.mama')).toHaveCount(0);
    await expect(page.locator('.sp-streifen.papa')).toHaveCount(31);
    await page.reload();
    await expect(page.locator('.sp-filter').getByRole('button', { name: '👨 Papa' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.sp-streifen.papa').first()).toBeVisible();
    await expect(page.locator('.sp-streifen.mama')).toHaveCount(0);
    await page.locator('.sp-filter').getByRole('button', { name: 'Beide' }).click();
    await expect(streifen(page, '2026-10-08', 'mama')).toHaveText('U'); // gespeichert
  });

  test('die Leiste ist kompakt (wie die Machette): höchstens 240 px, die erste Woche bleibt darüber zu sehen', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await page.getByRole('button', { name: '✏️ Eintragen' }).click();
    await expect(leiste(page)).toBeVisible();
    const masse = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      const knoepfe = [...document.querySelectorAll('.sp-pinsel button')].map((b) => b.getBoundingClientRect().height);
      return { leiste: r('.sp-pinsel'), ersteWoche: r('.sp-zelle[data-datum="2026-10-01"]'), kleinsterKnopf: Math.min(...knoepfe) };
    });
    expect(masse.leiste.height).toBeLessThanOrEqual(240);
    expect(masse.ersteWoche.top).toBeGreaterThanOrEqual(0);
    expect(masse.ersteWoche.bottom).toBeLessThanOrEqual(masse.leiste.top);
    expect(masse.kleinsterKnopf).toBeGreaterThanOrEqual(32);
  });

  test('die Leiste sitzt über den Registerkarten; das Raster bleibt darüber sichtbar und lässt sich bis zum letzten Tag scrollen', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await page.getByRole('button', { name: '✏️ Eintragen' }).click();
    await expect(leiste(page)).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const masse = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      return { leiste: r('.sp-pinsel'), tabs: r('nav.tabs'), letzter: r('.sp-zelle[data-datum="2026-10-31"]'), arten: r('.sp-arten'), seite: document.documentElement.scrollWidth };
    });
    expect(masse.seite).toBe(375);
    expect(masse.leiste.bottom).toBeLessThanOrEqual(masse.tabs.top + 1);
    expect(masse.leiste.left).toBeGreaterThanOrEqual(0);
    expect(masse.leiste.right).toBeLessThanOrEqual(375);
    expect(masse.letzter.bottom).toBeLessThanOrEqual(masse.leiste.top); // ganz unten: nichts versteckt sich hinter der Leiste
    expect(masse.arten.bottom).toBeLessThanOrEqual(masse.leiste.top);
    // fast ganz unten gescrollt (der letzte Tag gerade noch ganz zu sehen): ein Tipp lässt die Seite nicht springen
    await art(page, 'F Frühdienst').click();
    await page.evaluate(() => {
      const z = document.querySelector('.sp-zelle[data-datum="2026-10-31"]').getBoundingClientRect();
      window.scrollBy(0, z.top - 8);
    });
    const vorher = await page.evaluate(() => window.scrollY);
    expect(vorher).toBeGreaterThan(400);
    await zelle(page, '2026-10-31').click();
    await expect(streifen(page, '2026-10-31', 'papa')).toHaveText('F');
    expect(await page.evaluate(() => window.scrollY)).toBe(vorher);
    // ganz unten: eine andere Art wählen zeichnet die Seite neu, ohne dass sie nach oben rutscht
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const ganzUnten = await page.evaluate(() => window.scrollY);
    await art(page, 'M Mittagsdienst').click();
    await expect(art(page, 'M Mittagsdienst')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => window.scrollY)).toBe(ganzUnten);
  });
});

test.describe('Tagesblatt (ein Tag)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  const blattAm = (page, titel) => page.getByRole('dialog', { name: titel });
  const karte = (page, person) => page.locator(`.sp-tag-karte[data-person="${person}"]`);
  const knopf = (page, person, name) => karte(page, person).getByRole('button', { name, exact: true });
  const notizFeld = (page, person) => karte(page, person).getByRole('textbox', { name: 'Notiz (optional)' });
  const kopfText = (page, person) => karte(page, person).locator('.sp-tag-kopf small');
  const demo = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('fk.demo.v1')).schicht.monate['2026-10']);
  const PAPA_DIENSTE = ['F Frühdienst', 'M Mittagsdienst', 'NM Nachmittagsdienst', 'N Nacht', '2T 2Teiler', 'Ü Überstunde', 'S Schulung', 'U Urlaub', '– Frei'];

  test('ein Tipp auf den 21. zeigt beide (auch mit Filter „Papa“); NM setzen, Notiz „Dienst 47“ → nach dem Schließen ✎', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await page.locator('.sp-filter').getByRole('button', { name: '👨 Papa' }).click();
    await zelle(page, '2026-10-21').click();
    const blatt = blattAm(page, 'Mittwoch, 21. Oktober');
    await expect(blatt).toBeVisible();
    await expect(blatt.getByRole('heading', { name: 'Mittwoch, 21. Oktober' })).toBeVisible();
    await expect(page.locator('.sp-tag-karte')).toHaveCount(2); // der Filter gilt hier nicht
    await expect(karte(page, 'papa').locator('.sp-tag-kopf')).toContainText('👨 Papa');
    await expect(karte(page, 'mama').locator('.sp-tag-kopf')).toContainText('👩 Mama');
    // Mama (Beispiel): Tagdienst mit Zeiten, Dienstbesprechung 18:00–19:30
    await expect(kopfText(page, 'mama')).toHaveText('Tagdienst 07:00–17:45');
    await expect(knopf(page, 'mama', 'T Tagdienst')).toHaveAttribute('aria-pressed', 'true');
    await expect(knopf(page, 'mama', 'T Tagdienst')).toHaveClass(/aktiv/);
    await expect(karte(page, 'mama').locator('.sp-tag-zusatz')).toHaveText(['DB Dienstbesprechung 18:00–19:30 ✕']);
    // Dienstarten in Katalog-Reihenfolge und „Frei“; die Zusatz-Art DB gehört nicht dazu
    await expect(karte(page, 'papa').locator('.sp-tag-arten > *')).toHaveText(PAPA_DIENSTE);
    await expect(karte(page, 'mama').locator('.sp-tag-arten > *')).toHaveText(['T Tagdienst', 'N Nachtdienst', 'S Schulung', 'Ü Überstunde', 'U Urlaub', '– Frei']);
    await expect(knopf(page, 'papa', 'F Frühdienst').locator('.sp-tag-kuerzel')).toHaveClass(/sf-gruen/);

    await knopf(page, 'papa', 'NM Nachmittagsdienst').click();
    await expect(knopf(page, 'papa', 'NM Nachmittagsdienst')).toHaveAttribute('aria-pressed', 'true');
    await expect(kopfText(page, 'papa')).toHaveText('Nachmittagsdienst');
    await expect(streifen(page, '2026-10-21', 'papa')).toHaveText('NM'); // die Seite darunter zeigt es sofort
    await knopf(page, 'papa', 'N Nacht').click();
    await expect(kopfText(page, 'papa')).toHaveText('Nacht ☾');
    await knopf(page, 'papa', '– Frei').click();
    await expect(knopf(page, 'papa', '– Frei')).toHaveAttribute('aria-pressed', 'true');
    await expect(kopfText(page, 'papa')).toHaveText('Frei');
    await expect(streifen(page, '2026-10-21', 'papa')).toHaveClass(/leer/);
    await knopf(page, 'papa', 'NM Nachmittagsdienst').click();
    await expect(streifen(page, '2026-10-21', 'papa')).toHaveText('NM');

    // Notiz: wird beim Verlassen gespeichert (hier: Schließen), die Marke ✎ erscheint im Raster
    await expect(notizFeld(page, 'papa')).toHaveValue('');
    await expect(zelle(page, '2026-10-21').locator('.sp-notiz')).toHaveCount(0);
    await notizFeld(page, 'papa').fill('Dienst 47');
    await blatt.getByRole('button', { name: 'Schließen' }).click();
    await expect(blatt).toHaveCount(0);
    await expect(zelle(page, '2026-10-21').locator('.sp-notiz')).toHaveText('✎');
    await expect.poll(async () => (await demo(page)).n.papa['21']).toBe('Dienst 47');

    // wieder öffnen: alles steht da; Notiz mit Enter ändern
    await zelle(page, '2026-10-21').click();
    await expect(notizFeld(page, 'papa')).toHaveValue('Dienst 47');
    await expect(knopf(page, 'papa', 'NM Nachmittagsdienst')).toHaveAttribute('aria-pressed', 'true');
    await notizFeld(page, 'papa').fill('Dienst 47 · Linie 6');
    await notizFeld(page, 'papa').press('Enter');
    await expect.poll(async () => (await demo(page)).n.papa['21']).toBe('Dienst 47 · Linie 6');
    await expect(notizFeld(page, 'papa')).toHaveValue('Dienst 47 · Linie 6');
    // geleert und verlassen (Tipp daneben): Notiz weg; Escape schließt
    await notizFeld(page, 'papa').fill('');
    await karte(page, 'papa').locator('.sp-tag-kopf').click();
    await expect.poll(async () => (await demo(page)).n.papa['21'] ?? null).toBeNull();
    await page.keyboard.press('Escape');
    await expect(blatt).toHaveCount(0);
    await expect(zelle(page, '2026-10-21').locator('.sp-notiz')).toHaveCount(0);
  });

  test('Notiz schreiben und gleich einen anderen Knopf tippen: der Tipp wirkt, die Notiz ist gespeichert', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await zelle(page, '2026-10-22').click();
    await notizFeld(page, 'papa').fill('Dienst 47');
    await karte(page, 'mama').getByRole('button', { name: '＋ Zusatz' }).click();
    await expect(karte(page, 'mama').locator('.sp-tag-zusatz-form')).toBeVisible();
    await expect.poll(async () => (await demo(page)).n.papa['22']).toBe('Dienst 47');
    await notizFeld(page, 'papa').fill('Dienst 48');
    await knopf(page, 'papa', 'M Mittagsdienst').click();
    await expect(knopf(page, 'papa', 'M Mittagsdienst')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await demo(page)).n.papa['22']).toBe('Dienst 48');
    await expect(notizFeld(page, 'papa')).toHaveValue('Dienst 48');
  });

  test('Notiz: höchstens 40 Zeichen lassen sich schreiben; Escape mitten im Schreiben speichert sie trotzdem', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await zelle(page, '2026-10-22').click();
    await expect(notizFeld(page, 'mama')).toHaveAttribute('maxlength', '40');
    await notizFeld(page, 'mama').click();
    await page.keyboard.type('x'.repeat(41));
    await expect(notizFeld(page, 'mama')).toHaveValue('x'.repeat(40));
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(async () => (await demo(page)).n.mama['22']).toBe('x'.repeat(40));
  });

  test('Mama „＋ Zusatz“: DB mit 18:30–20:00 hinzufügen (Liste und Marke im Raster), ✕ nimmt ihn weg; höchstens drei', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await zelle(page, '2026-10-22').click();
    const zusaetze = karte(page, 'mama').locator('.sp-tag-zusatz');
    const plus = karte(page, 'mama').getByRole('button', { name: '＋ Zusatz' });
    const form = karte(page, 'mama').locator('.sp-tag-zusatz-form');
    const von = form.getByRole('textbox', { name: 'Von', exact: true });
    const bis = form.getByRole('textbox', { name: 'Bis', exact: true });
    await expect(zusaetze).toHaveCount(0);
    await expect(karte(page, 'papa').getByRole('button', { name: '＋ Zusatz' })).toHaveCount(0); // Papa hat (noch) keine Zusatz-Art
    await plus.click();
    await expect(form.getByRole('button', { name: 'DB Dienstbesprechung' })).toHaveAttribute('aria-pressed', 'true');
    await expect(von).toHaveValue('18:00'); // vorbelegt mit den Zeiten der Art
    await expect(bis).toHaveValue('19:30');
    await von.fill('18:30');
    await bis.fill('20:00');
    await form.getByRole('button', { name: 'Hinzufügen' }).click();
    await expect(form).toHaveCount(0);
    await expect(zusaetze).toHaveText(['DB Dienstbesprechung 18:30–20:00 ✕']);
    await expect(zelle(page, '2026-10-22').locator('.sp-zusatz')).toHaveText('DB');
    await expect.poll(async () => (await demo(page)).z.mama['22']).toEqual([{ k: expect.any(String), von: '18:30', bis: '20:00' }]);

    // „Abbrechen“ schließt das Formular, ohne etwas einzutragen
    await plus.click();
    await form.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(form).toHaveCount(0);
    await expect(zusaetze).toHaveCount(1);

    // zwei weitere (mit den vorbelegten Zeiten bzw. 07:00–08:00), ein vierter wird abgelehnt
    await plus.click();
    await form.getByRole('button', { name: 'Hinzufügen' }).click();
    await expect(zusaetze).toHaveCount(2);
    await plus.click();
    await von.fill('07:00');
    await bis.fill('08:00');
    await form.getByRole('button', { name: 'Hinzufügen' }).click();
    await expect(zusaetze).toHaveText(['DB Dienstbesprechung 18:30–20:00 ✕', 'DB Dienstbesprechung 18:00–19:30 ✕', 'DB Dienstbesprechung 07:00–08:00 ✕']);
    await plus.click();
    await von.fill('12:00');
    await form.getByRole('button', { name: 'Hinzufügen' }).click();
    await expect(page.locator('.toast.fehler')).toHaveText('Höchstens 3 Zusätze pro Tag.');
    await expect(von).toHaveValue('12:00'); // das Formular bleibt mit der Eingabe offen
    await form.getByRole('button', { name: 'Abbrechen' }).click();

    // ✕ entfernt genau diesen Zusatz
    await karte(page, 'mama').getByRole('button', { name: 'Dienstbesprechung 18:00–19:30 entfernen' }).click();
    await karte(page, 'mama').getByRole('button', { name: 'Dienstbesprechung 07:00–08:00 entfernen' }).click();
    await expect(zusaetze).toHaveText(['DB Dienstbesprechung 18:30–20:00 ✕']);
    await karte(page, 'mama').getByRole('button', { name: 'Dienstbesprechung 18:30–20:00 entfernen' }).click();
    await expect(zusaetze).toHaveCount(0);
    await expect(zelle(page, '2026-10-22').locator('.sp-zusatz')).toHaveCount(0);
    await expect.poll(async () => (await demo(page)).z.mama['22'] ?? null).toBeNull();
  });

  test('zwei DB mit gleichem Von, anderem Bis: ✕ entfernt nur den einen', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await zelle(page, '2026-10-21').click(); // Beispiel: Mama DB 18:00–19:30
    const zusaetze = karte(page, 'mama').locator('.sp-tag-zusatz');
    const form = karte(page, 'mama').locator('.sp-tag-zusatz-form');
    await karte(page, 'mama').getByRole('button', { name: '＋ Zusatz' }).click();
    await form.getByRole('textbox', { name: 'Bis', exact: true }).fill('20:00');
    await form.getByRole('button', { name: 'Hinzufügen' }).click();
    await expect(zusaetze).toHaveText(['DB Dienstbesprechung 18:00–19:30 ✕', 'DB Dienstbesprechung 18:00–20:00 ✕']);
    await karte(page, 'mama').getByRole('button', { name: 'Dienstbesprechung 18:00–20:00 entfernen' }).click();
    await expect(zusaetze).toHaveText(['DB Dienstbesprechung 18:00–19:30 ✕']);
    await expect.poll(async () => (await demo(page)).z.mama['21']).toEqual([{ k: expect.any(String), von: '18:00', bis: '19:30' }]);
    await expect(zelle(page, '2026-10-21').locator('.sp-zusatz')).toHaveText('DB');
  });

  test('eine ausgeblendete (archivierte) Art des Tages steht da, ist aber kein Knopf; eine unbekannte heißt „Unbekannte Art“', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await expect(zelle(page, '2026-10-21')).toBeVisible();
    await page.evaluate(() => {
      const daten = JSON.parse(localStorage.getItem('fk.demo.v1'));
      const s = daten.schicht.katalog.arten.papa.find((a) => a.kuerzel === 'S');
      s.archiv = true;
      const monat = daten.schicht.monate['2026-10'];
      monat.t.papa = monat.t.papa.slice(0, 20) + s.k + monat.t.papa.slice(21); // 21.10. Papa: Schulung (ausgeblendet)
      monat.t.mama = monat.t.mama.slice(0, 20) + 'z' + monat.t.mama.slice(21); // 21.10. Mama: eine Art, die es nicht gibt
      localStorage.setItem('fk.demo.v1', JSON.stringify(daten));
    });
    await page.reload();
    await zelle(page, '2026-10-21').click();
    await expect(kopfText(page, 'papa')).toHaveText('Schulung');
    await expect(karte(page, 'papa').locator('.sp-tag-arten > *')).toHaveText([...PAPA_DIENSTE.filter((t) => t !== 'S Schulung' && t !== '– Frei'), 'S Schulung (ausgeblendet)', '– Frei']);
    await expect(karte(page, 'papa').getByRole('button', { name: /Schulung/ })).toHaveCount(0);
    await expect(karte(page, 'papa').locator('.sp-tag-art.inaktiv')).toHaveText('S Schulung (ausgeblendet)');
    await expect(kopfText(page, 'mama')).toHaveText('Unbekannte Art');
    await expect(karte(page, 'mama').locator('.sp-tag-art.inaktiv')).toHaveText('? Unbekannte Art');
    // eine andere Art wählen: die ausgeblendete verschwindet aus der Reihe
    await knopf(page, 'papa', 'F Frühdienst').click();
    await expect(karte(page, 'papa').locator('.sp-tag-art.inaktiv')).toHaveCount(0);
    await expect(streifen(page, '2026-10-21', 'papa')).toHaveText('F');
  });

  test('mit dem Pinsel malt ein Tipp; nach „Fertig“ öffnet ein Tipp das Tagesblatt', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await page.getByRole('button', { name: '✏️ Eintragen' }).click();
    await page.locator('.sp-pinsel').getByRole('button', { name: 'F Frühdienst', exact: true }).click();
    await zelle(page, '2026-10-08').click();
    await expect(streifen(page, '2026-10-08', 'papa')).toHaveText('F');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.locator('.sp-pinsel').getByRole('button', { name: 'Fertig' }).click();
    await zelle(page, '2026-10-08').click();
    await expect(blattAm(page, 'Donnerstag, 8. Oktober')).toBeVisible();
    await expect(knopf(page, 'papa', 'F Frühdienst')).toHaveAttribute('aria-pressed', 'true');
  });

  test('auf 375 px ragt im Tagesblatt nichts seitwärts hinaus', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await zelle(page, '2026-10-21').click();
    await karte(page, 'mama').getByRole('button', { name: '＋ Zusatz' }).click();
    const masse = await page.evaluate(() => {
      const b = document.querySelector('.blatt');
      return { scroll: b.scrollWidth, breite: b.clientWidth, rechts: Math.max(...[...b.querySelectorAll('button, input:not(.picker-unsichtbar)')].map((e) => e.getBoundingClientRect().right)) };
    });
    expect(masse.scroll).toBeLessThanOrEqual(masse.breite);
    expect(masse.rechts).toBeLessThanOrEqual(375);
  });
});
