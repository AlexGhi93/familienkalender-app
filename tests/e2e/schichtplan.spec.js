// Schichtplan (Demo): Registerkarte „Schicht“, Monatsraster mit zwei Streifen je Tag (oben Papa, unten Mama), Monatswechsel,
// Filter (gemerkt auf diesem Telefon), Zählung und Legende; auf 375 px ragt nichts hinaus.
import { test, expect, starteDemo, starteGoogleAusSnapshot, starteGoogleVerbunden, tab, erwarteToast, fehlerToastsZaehlen, NETZFEHLER } from './hilfen.js';
import { standardKatalog } from '../../src/domain/schicht.js';
import { streifen, zelle } from './schichtplan-hilfen.js';

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
  await expect(streifen(page, '2026-11-10', 'mama')).toHaveClass(/gestreift muster-urlaub/);
  await page.getByRole('button', { name: 'Nächster Monat' }).click();
  await page.getByRole('button', { name: 'Nächster Monat' }).click();
  await expect(monatTitel(page)).toHaveText('Januar 2027');
  await expect(page.locator('.sp-zelle')).toHaveCount(31);
  await expect(page.locator('.sp-zaehlung')).toContainText('Noch nichts eingetragen');
  for (let i = 0; i < 4; i += 1) await page.getByRole('button', { name: 'Vorheriger Monat' }).click();
  await expect(monatTitel(page)).toHaveText('September 2026');
  await expect(page.locator('.sp-zelle .sp-streifen.papa:not(.leer)').first()).toBeVisible();
});

test('Ersatzdienst E: in Legende, Pinsel und Raster gelb und gestreift wie Urlaub, aber mit eigenem Kürzel', async ({ page }) => {
  await starteDemo(page, { route: '#/schicht' });
  const muster = (loc) => loc.evaluate((el) => getComputedStyle(el).backgroundImage);
  const e = page.locator('.sp-legende .sp-lg').filter({ hasText: 'Ersatzdienst' });
  await expect(e.locator('.sp-lg-kuerzel')).toHaveText('E');
  await expect(e.locator('.sp-lg-kuerzel')).toHaveClass(/sf-gelb/);
  await expect(e.locator('.sp-lg-kuerzel')).toHaveClass(/gestreift/);
  await expect(e.locator('.sp-lg-kuerzel')).toHaveClass(/muster-offen/);
  const urlaub = page.locator('.sp-legende .sp-lg').filter({ hasText: 'Urlaub' }).first().locator('.sp-lg-kuerzel');
  await expect(urlaub).toHaveClass(/muster-urlaub/);
  expect(await muster(e.locator('.sp-lg-kuerzel'))).toContain('repeating-linear-gradient');
  expect(await muster(e.locator('.sp-lg-kuerzel'))).toBe(await muster(urlaub)); // dieselben Streifen wie Urlaub
  await page.getByRole('button', { name: '✏️ Eintragen' }).click();
  const knopfE = page.locator('.sp-pinsel').getByRole('button', { name: 'E Ersatzdienst', exact: true });
  await expect(knopfE.locator('.sp-pinsel-kuerzel')).toHaveClass(/sf-gelb/);
  await expect(knopfE.locator('.sp-pinsel-kuerzel')).toHaveClass(/muster-offen/);
  expect(await muster(knopfE.locator('.sp-pinsel-kuerzel'))).toContain('repeating-linear-gradient');
  await knopfE.click();
  await zelle(page, '2026-10-08').click();
  await expect(streifen(page, '2026-10-08', 'papa')).toHaveText('E');
  await expect(streifen(page, '2026-10-08', 'papa')).toHaveClass(/sf-gelb/);
  await expect(streifen(page, '2026-10-08', 'papa')).toHaveClass(/muster-offen/);
  expect(await muster(streifen(page, '2026-10-08', 'papa'))).toContain('repeating-linear-gradient');
  await expect(zelle(page, '2026-10-08')).toHaveAttribute('aria-label', /Papa Ersatzdienst/);
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

test('Demo mit alten Schichtarten ohne E: beim Start im Hintergrund einmal ergänzt, auch ohne den Schichtplan zu öffnen', async ({ page }) => {
  await starteDemo(page);
  const papaE = () => page.evaluate(() => JSON.parse(localStorage.getItem('fk.demo.v1')).schicht.katalog?.arten?.papa?.filter((a) => a.kuerzel === 'E').length ?? 0);
  await expect.poll(papaE).toBe(1); // die Beispieldaten haben E schon
  await page.evaluate(() => {
    const daten = JSON.parse(localStorage.getItem('fk.demo.v1'));
    daten.schicht.katalog.arten.papa = daten.schicht.katalog.arten.papa.filter((a) => a.kuerzel !== 'E');
    delete daten.schicht.katalog.ergaenzt; // wie vor „E – Ersatzdienst“: noch keine Marke
    localStorage.setItem('fk.demo.v1', JSON.stringify(daten));
  });
  expect(await papaE()).toBe(0);
  await page.reload();
  await expect(page.locator('nav.tabs')).toBeVisible();
  await expect.poll(papaE).toBe(1);
  await page.reload();
  await expect(page.locator('nav.tabs')).toBeVisible();
  await tab(page, 'Schicht');
  await page.getByRole('button', { name: '✏️ Eintragen' }).click();
  await expect(page.locator('.sp-pinsel').getByRole('button', { name: 'E Ersatzdienst', exact: true })).toHaveCount(1);
  expect(await papaE()).toBe(1);
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

test.describe('Telefon mit 320 px Breite', () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test('Titel in einer Zeile neben „Eintragen“; „DB +2 ✎“ bleibt im Feld; Von und Bis untereinander, „HH:MM“ ganz zu sehen', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await expect(zelle(page, '2026-10-26')).toBeVisible();
    const titel = await page.locator('.sp-kopf h1').evaluate((h) => ({ hoehe: h.getBoundingClientRect().height, zeile: parseFloat(getComputedStyle(h).lineHeight) }));
    expect(titel.hoehe).toBeLessThan(titel.zeile * 1.5);
    await page.evaluate(() => {
      const daten = JSON.parse(localStorage.getItem('fk.demo.v1'));
      const monat = daten.schicht.monate['2026-10'];
      const db = daten.schicht.katalog?.arten?.mama?.find((a) => a.kuerzel === 'DB')?.k ?? 'F';
      monat.z.mama['26'] = [['07:00', '08:00'], ['12:00', '13:00'], ['18:00', '19:30']].map(([von, bis]) => ({ k: db, von, bis }));
      monat.n.mama['26'] = 'Viel los';
      localStorage.setItem('fk.demo.v1', JSON.stringify(daten));
    });
    await page.reload();
    await expect(zelle(page, '2026-10-26').locator('.sp-mehr')).toHaveText('+2');
    const feld = await zelle(page, '2026-10-26').evaluate((z) => {
      const r = z.getBoundingClientRect();
      const m = z.querySelector('.sp-marken').getBoundingClientRect();
      return { links: r.left + z.clientLeft, rechts: r.left + z.clientLeft + z.clientWidth, mLinks: m.left, mRechts: m.right };
    });
    expect(feld.mLinks).toBeGreaterThanOrEqual(feld.links - 0.5);
    expect(feld.mRechts).toBeLessThanOrEqual(feld.rechts + 0.5);
    // Von und Bis im Formular für eine neue Art
    await page.getByRole('button', { name: 'Schichtarten bearbeiten' }).click();
    await page.locator('.sp-arten-person[data-person="papa"]').getByRole('button', { name: '＋ Neue Art' }).click();
    const von = page.locator('.sp-art-form').getByRole('textbox', { name: 'Von', exact: true });
    const bis = page.locator('.sp-art-form').getByRole('textbox', { name: 'Bis', exact: true });
    await expect(von).toBeVisible();
    expect((await bis.boundingBox()).y).toBeGreaterThan((await von.boundingBox()).y + 20);
    const platz = await von.evaluate((e) => {
      const s = getComputedStyle(e);
      const c = document.createElement('canvas').getContext('2d');
      c.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
      return e.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) - c.measureText(e.placeholder).width;
    });
    expect(platz).toBeGreaterThanOrEqual(0);
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
      'E Ersatzdienst',
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
