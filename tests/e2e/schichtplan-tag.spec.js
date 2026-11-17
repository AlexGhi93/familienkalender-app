// Schichtplan: das Tagesblatt (ein Tag) – beide Personen, Dienst setzen, Notiz, Zusätze, Abbrechen und Rückgängig.
import { test, expect, starteDemo, erwarteToast } from './hilfen.js';
import { streifen, zelle } from './schichtplan-hilfen.js';

test.describe('Tagesblatt (ein Tag)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  const blattAm = (page, titel) => page.getByRole('dialog', { name: titel });
  const karte = (page, person) => page.locator(`.sp-tag-karte[data-person="${person}"]`);
  const knopf = (page, person, name) => karte(page, person).getByRole('button', { name, exact: true });
  const notizFeld = (page, person) => karte(page, person).getByRole('textbox', { name: 'Notiz (optional)' });
  const kopfText = (page, person) => karte(page, person).locator('.sp-tag-kopf small');
  const demo = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('fk.demo.v1')).schicht.monate['2026-10']);
  const PAPA_DIENSTE = ['F Frühdienst', 'M Mittagsdienst', 'NM Nachmittagsdienst', 'N Nacht', '2T 2Teiler', 'Ü Überstunde', 'S Schulung', 'U Urlaub', 'E Ersatzdienst', '– Frei'];

  test('ein Tipp auf den 21. zeigt beide (auch mit Filter „Papa“); NM setzen, Notiz „Dienst 12“ → nach dem Schließen ✎', async ({ page }) => {
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
    await notizFeld(page, 'papa').fill('Dienst 12');
    await blatt.getByRole('button', { name: 'Schließen' }).click();
    await expect(blatt).toHaveCount(0);
    await expect(zelle(page, '2026-10-21').locator('.sp-notiz')).toHaveText('✎');
    await expect.poll(async () => (await demo(page)).n.papa['21']).toBe('Dienst 12');

    // wieder öffnen: alles steht da; Notiz mit Enter ändern
    await zelle(page, '2026-10-21').click();
    await expect(notizFeld(page, 'papa')).toHaveValue('Dienst 12');
    await expect(knopf(page, 'papa', 'NM Nachmittagsdienst')).toHaveAttribute('aria-pressed', 'true');
    await notizFeld(page, 'papa').fill('Dienst 12 · Tausch');
    await notizFeld(page, 'papa').press('Enter');
    await expect.poll(async () => (await demo(page)).n.papa['21']).toBe('Dienst 12 · Tausch');
    await expect(notizFeld(page, 'papa')).toHaveValue('Dienst 12 · Tausch');
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
    await notizFeld(page, 'papa').fill('Dienst 12');
    await karte(page, 'mama').getByRole('button', { name: '＋ Dienstbesprechung' }).click();
    await expect(karte(page, 'mama').locator('.sp-tag-zusatz-form')).toBeVisible();
    await expect.poll(async () => (await demo(page)).n.papa['22']).toBe('Dienst 12');
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

  test('Mama „＋ Dienstbesprechung“: DB mit 18:30–20:00 hinzufügen (Liste und Marke im Raster), ✕ nimmt ihn weg; höchstens drei', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await zelle(page, '2026-10-22').click();
    const zusaetze = karte(page, 'mama').locator('.sp-tag-zusatz');
    const plus = karte(page, 'mama').getByRole('button', { name: '＋ Dienstbesprechung' });
    const form = karte(page, 'mama').locator('.sp-tag-zusatz-form');
    const von = form.getByRole('textbox', { name: 'Von', exact: true });
    const bis = form.getByRole('textbox', { name: 'Bis', exact: true });
    await expect(zusaetze).toHaveCount(0);
    await expect(karte(page, 'papa').getByRole('button', { name: /^＋/ })).toHaveCount(0); // Papa hat (noch) keine Zusatz-Art
    await plus.click();
    await expect(form.locator('.sp-tag-zusatz-kopf')).toHaveText('DB Dienstbesprechung'); // die Art steht fest, keine Auswahl
    await expect(karte(page, 'mama').getByRole('group', { name: 'Dienstbesprechung hinzufügen' })).toBeVisible();
    await expect(form.getByRole('group', { name: 'Art des Zusatzes' })).toHaveCount(0);
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
    await karte(page, 'mama').getByRole('button', { name: '＋ Dienstbesprechung' }).click();
    await form.getByRole('textbox', { name: 'Bis', exact: true }).fill('20:00');
    await form.getByRole('button', { name: 'Hinzufügen' }).click();
    await expect(zusaetze).toHaveText(['DB Dienstbesprechung 18:00–19:30 ✕', 'DB Dienstbesprechung 18:00–20:00 ✕']);
    await karte(page, 'mama').getByRole('button', { name: 'Dienstbesprechung 18:00–20:00 entfernen' }).click();
    await expect(zusaetze).toHaveText(['DB Dienstbesprechung 18:00–19:30 ✕']);
    await expect.poll(async () => (await demo(page)).z.mama['21']).toEqual([{ k: expect.any(String), von: '18:00', bis: '19:30' }]);
    await expect(zelle(page, '2026-10-21').locator('.sp-zusatz')).toHaveText('DB');
  });

  test('✕ → „Gelöscht ✓ · Rückgängig“: der Zusatz kommt an seine Stelle zurück (auch im Speicher)', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await zelle(page, '2026-10-21').click(); // Beispiel: Mama DB 18:00–19:30
    const zusaetze = karte(page, 'mama').locator('.sp-tag-zusatz');
    const form = karte(page, 'mama').locator('.sp-tag-zusatz-form');
    await karte(page, 'mama').getByRole('button', { name: '＋ Dienstbesprechung' }).click();
    await form.getByRole('textbox', { name: 'Von', exact: true }).fill('20:00');
    await form.getByRole('textbox', { name: 'Bis', exact: true }).fill('21:00');
    await form.getByRole('button', { name: 'Hinzufügen' }).click();
    await expect(zusaetze).toHaveText(['DB Dienstbesprechung 18:00–19:30 ✕', 'DB Dienstbesprechung 20:00–21:00 ✕']);
    await karte(page, 'mama').getByRole('button', { name: 'Dienstbesprechung 18:00–19:30 entfernen' }).click();
    const meldung = page.locator('.toast').filter({ hasText: 'Gelöscht ✓' });
    await expect(meldung.getByRole('button', { name: 'Rückgängig' })).toBeVisible();
    await expect(zusaetze).toHaveText(['DB Dienstbesprechung 20:00–21:00 ✕']);
    await meldung.getByRole('button', { name: 'Rückgängig' }).click();
    await erwarteToast(page, 'Wiederhergestellt ✓');
    await expect(zusaetze).toHaveText(['DB Dienstbesprechung 18:00–19:30 ✕', 'DB Dienstbesprechung 20:00–21:00 ✕']);
    await expect.poll(async () => (await demo(page)).z.mama['21'].map((z) => `${z.von}–${z.bis}`)).toEqual(['18:00–19:30', '20:00–21:00']);
  });

  test('„＋ Dienstbesprechung“ öffnet direkt Von/Bis (vorbelegt): 19:00–20:30 → Marke DB und Zeile; Hinweis auf die Erinnerung', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await zelle(page, '2026-10-23').click();
    const form = karte(page, 'mama').locator('.sp-tag-zusatz-form');
    await knopf(page, 'mama', '＋ Dienstbesprechung').click();
    await expect(form.getByRole('textbox', { name: 'Von', exact: true })).toHaveValue('18:00');
    await expect(form.getByRole('textbox', { name: 'Bis', exact: true })).toHaveValue('19:30');
    await expect(karte(page, 'mama').locator('.sp-tag-erinnerung')).toHaveText('🔔 Erinnerung 1 Tag und 1 Stunde vorher auf dem Telefon von Mama (in der Demo kommen keine Benachrichtigungen)');
    await expect(knopf(page, 'mama', '＋ Dienstbesprechung')).toHaveCount(0); // solange das Formular offen ist
    await form.getByRole('textbox', { name: 'Von', exact: true }).fill('19:00');
    await form.getByRole('textbox', { name: 'Bis', exact: true }).fill('20:30');
    await form.getByRole('button', { name: 'Hinzufügen' }).click();
    await expect(form).toHaveCount(0);
    await expect(karte(page, 'mama').locator('.sp-tag-erinnerung')).toHaveCount(0);
    await expect(karte(page, 'mama').locator('.sp-tag-zusatz')).toHaveText(['DB Dienstbesprechung 19:00–20:30 ✕']);
    await expect(zelle(page, '2026-10-23').locator('.sp-zusatz')).toHaveText('DB');
    await expect.poll(async () => (await demo(page)).z.mama['23']).toEqual([{ k: expect.any(String), von: '19:00', bis: '20:30' }]);
  });

  test('ohne „Erinnern“ kein Hinweis; eine zweite Zusatz-Art bekommt ihren eigenen Knopf', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await expect(zelle(page, '2026-10-21')).toBeVisible();
    await page.evaluate(() => {
      const daten = JSON.parse(localStorage.getItem('fk.demo.v1'));
      const arten = daten.schicht.katalog.arten.mama;
      arten.find((a) => a.kuerzel === 'DB').erinnern = false;
      arten.push({ k: 'X', kuerzel: 'EA', name: 'Elternabend', farbe: 'oliv', gruppe: 'zusatz', von: '19:00', bis: '20:00', erinnern: true });
      localStorage.setItem('fk.demo.v1', JSON.stringify(daten));
    });
    await page.reload();
    await zelle(page, '2026-10-23').click();
    await expect(karte(page, 'mama').getByRole('button', { name: /^＋/ })).toHaveText(['＋ Dienstbesprechung', '＋ Elternabend']);
    await knopf(page, 'mama', '＋ Dienstbesprechung').click();
    await expect(karte(page, 'mama').locator('.sp-tag-zusatz-form')).toBeVisible();
    await expect(karte(page, 'mama').locator('.sp-tag-erinnerung')).toHaveCount(0);
    await karte(page, 'mama').getByRole('button', { name: 'Abbrechen' }).click();
    await knopf(page, 'mama', '＋ Elternabend').click();
    await expect(karte(page, 'mama').locator('.sp-tag-zusatz-kopf')).toHaveText('EA Elternabend');
    await expect(karte(page, 'mama').locator('.sp-tag-zusatz-form').getByRole('textbox', { name: 'Von', exact: true })).toHaveValue('19:00');
    await expect(karte(page, 'mama').locator('.sp-tag-erinnerung')).toHaveText('🔔 Erinnerung 1 Tag und 1 Stunde vorher auf dem Telefon von Mama (in der Demo kommen keine Benachrichtigungen)');
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

  test('Schulung mit Zeiten für diesen Tag', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    const von = (person = 'papa') => karte(page, person).getByRole('textbox', { name: 'Von', exact: true });
    const bis = (person = 'papa') => karte(page, person).getByRole('textbox', { name: 'Bis', exact: true });
    await zelle(page, '2026-10-08').click();
    const blatt = blattAm(page, 'Donnerstag, 8. Oktober');
    await knopf(page, 'papa', 'S Schulung').click();
    await expect(karte(page, 'papa').getByText('Zeiten für diesen Tag').first()).toBeVisible();
    await expect(von()).toHaveValue('');
    await expect(bis()).toHaveValue('');
    await expect(von()).toBeFocused(); // gleich schreiben: der Dienst hat keine Zeiten
    await von().fill('08:00');
    await bis().fill('16:00');
    await bis().press('Enter');
    await expect(kopfText(page, 'papa')).toHaveText('Schulung 08:00–16:00');
    await blatt.getByRole('button', { name: 'Schließen' }).click();
    await expect(zelle(page, '2026-10-08').locator('.sp-uhr')).toHaveText('🕘');
    await expect(zelle(page, '2026-10-08')).toHaveAttribute('aria-label', /Papa Schulung 08:00–16:00/);
    await expect.poll(async () => (await demo(page)).zt.papa['8']).toEqual([expect.any(String), '08:00', '16:00']);

    await page.reload();
    await expect(zelle(page, '2026-10-08').locator('.sp-uhr')).toHaveText('🕘');
    await zelle(page, '2026-10-08').click();
    await expect(kopfText(page, 'papa')).toHaveText('Schulung 08:00–16:00');
    await expect(von()).toHaveValue('08:00');
    await expect(bis()).toHaveValue('16:00');
    // eine andere Art: die Zeiten des Tages sind weg
    await knopf(page, 'papa', 'F Frühdienst').click();
    await expect(kopfText(page, 'papa')).toHaveText('Frühdienst');
    await expect(von()).toHaveValue('');
    await blattAm(page, 'Donnerstag, 8. Oktober').getByRole('button', { name: 'Schließen' }).click();
    await expect(zelle(page, '2026-10-08').locator('.sp-uhr')).toHaveCount(0);
  });

  test('Eine Uhrzeit allein wird nicht gespeichert', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await zelle(page, '2026-10-08').click();
    await knopf(page, 'papa', 'S Schulung').click();
    const von = karte(page, 'papa').getByRole('textbox', { name: 'Von', exact: true });
    const bis = karte(page, 'papa').getByRole('textbox', { name: 'Bis', exact: true });
    await von.fill('08:00');
    await von.press('Enter');
    await expect(karte(page, 'papa').getByText('Bitte beide Uhrzeiten eingeben.')).toBeVisible();
    await expect(kopfText(page, 'papa')).toHaveText('Schulung');
    expect((await demo(page)).zt).toBeUndefined();
    await bis.fill('12:30');
    await bis.press('Enter');
    await expect(karte(page, 'papa').getByText('Bitte beide Uhrzeiten eingeben.')).toBeHidden();
    await expect(kopfText(page, 'papa')).toHaveText('Schulung 08:00–12:30');
    // beide leeren: zurück zu den Zeiten der Art (Schulung hat keine)
    await von.fill('');
    await von.press('Enter');
    await expect(karte(page, 'papa').getByText('Bitte beide Uhrzeiten eingeben.')).toBeVisible();
    await bis.fill('');
    await bis.press('Enter');
    await expect(kopfText(page, 'papa')).toHaveText('Schulung');
    await expect.poll(async () => (await demo(page)).zt).toBeUndefined();
  });

  test('abgelehnte Uhrzeiten (Monat zu voll): die Eingabe bleibt stehen, die Meldung kommt, nichts gespeichert', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await expect(zelle(page, '2026-10-08')).toBeVisible();
    // 08.10. Papa Schulung; der Monat steht knapp unter der Grenze von 6000 Zeichen (Füllung als fremdes Feld, zählt mit)
    await page.evaluate(async () => {
      const { monatText } = await import('/src/domain/schicht.js');
      const daten = JSON.parse(localStorage.getItem('fk.demo.v1'));
      const s = daten.schicht.katalog.arten.papa.find((a) => a.kuerzel === 'S').k;
      const monat = daten.schicht.monate['2026-10'];
      monat.t.papa = monat.t.papa.slice(0, 7) + s + monat.t.papa.slice(8);
      monat.fremd = { w: '' };
      monat.fremd.w = 'x'.repeat(6000 - 20 - monatText(monat).length);
      localStorage.setItem('fk.demo.v1', JSON.stringify(daten));
    });
    await page.reload();
    await zelle(page, '2026-10-08').click();
    await expect(kopfText(page, 'papa')).toHaveText('Schulung');
    const von = karte(page, 'papa').getByRole('textbox', { name: 'Von', exact: true });
    const bis = karte(page, 'papa').getByRole('textbox', { name: 'Bis', exact: true });
    await von.fill('08:00');
    await bis.fill('16:00');
    await bis.press('Enter');
    await erwarteToast(page, 'Zu viele Notizen in diesem Monat. Bitte einige kürzen oder löschen.');
    await expect(von).toHaveValue('08:00');
    await expect(bis).toHaveValue('16:00');
    await expect(kopfText(page, 'papa')).toHaveText('Schulung');
    expect((await demo(page)).zt).toBeUndefined();
    // korrigieren geht weiter vom Entwurf aus: beide leeren → nichts zu speichern, keine weitere Meldung
    await von.fill('');
    await von.press('Enter');
    await expect(bis).toHaveValue('16:00');
    await expect(karte(page, 'papa').getByText('Bitte beide Uhrzeiten eingeben.')).toBeVisible();
  });

  test('auf 375 px ragt im Tagesblatt nichts seitwärts hinaus', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await zelle(page, '2026-10-21').click();
    await karte(page, 'mama').getByRole('button', { name: '＋ Dienstbesprechung' }).click();
    const masse = await page.evaluate(() => {
      const b = document.querySelector('.blatt');
      return { scroll: b.scrollWidth, breite: b.clientWidth, rechts: Math.max(...[...b.querySelectorAll('button, input:not(.picker-unsichtbar)')].map((e) => e.getBoundingClientRect().right)) };
    });
    expect(masse.scroll).toBeLessThanOrEqual(masse.breite);
    expect(masse.rechts).toBeLessThanOrEqual(375);
  });
  // ---------- Diensttausch ----------
  const monatsSeite = (page) => page.locator('.sp-monat h2');
  const zaehlung = (page, person) => page.locator(`.sp-zaehlung .sp-person-zeile[data-person="${person}"] span`).last();
  const vor = (page) => page.getByRole('button', { name: 'Nächster Monat' }).click();
  const zurueck = (page) => page.getByRole('button', { name: 'Vorheriger Monat' }).click();
  const tauschKnopf = (page, person) => knopf(page, person, '⇄ Diensttausch');
  const formular = (page) => page.getByRole('dialog', { name: 'Diensttausch', exact: true });

  /** „Tausch rückgängig“ im offenen Tagesblatt (Papa) und bestätigen: danach kein ⇄ mehr im Blatt, „⇄ Diensttausch“ wieder da. */
  async function tauschZuruecknehmen(page) {
    await karte(page, 'papa').getByRole('button', { name: 'Tausch rückgängig' }).click();
    const rueck = page.getByRole('dialog', { name: 'Diensttausch rückgängig machen?' });
    await expect(rueck).toContainText('Beide Tage kommen genau so zurück, wie sie vor dem Tausch waren');
    await rueck.getByRole('button', { name: 'Rückgängig machen' }).click();
    await expect(rueck).toHaveCount(0);
    await expect(karte(page, 'papa').locator('.sp-tag-tausch')).toHaveCount(0);
    await expect(tauschKnopf(page, 'papa')).toBeVisible();
  }

  /** Papa: 30.12.2026 Frühdienst und 04.01.2027 Schulung mit dem Pinsel eintragen (die Demo hat diese Monate leer); endet im Dezember. */
  async function dienstePinseln(page) {
    await starteDemo(page, { route: '#/schicht' });
    await vor(page);
    await vor(page);
    await expect(monatsSeite(page)).toHaveText('Dezember 2026');
    await page.getByRole('button', { name: '✏️ Eintragen' }).click();
    const leiste = page.locator('.sp-pinsel');
    await leiste.getByRole('button', { name: 'F Frühdienst', exact: true }).click();
    await zelle(page, '2026-12-30').click();
    await vor(page);
    await expect(monatsSeite(page)).toHaveText('Januar 2027');
    await leiste.getByRole('button', { name: 'S Schulung', exact: true }).click();
    await zelle(page, '2027-01-04').click();
    await leiste.getByRole('button', { name: 'Fertig' }).click();
    await zurueck(page);
    await expect(streifen(page, '2026-12-30', 'papa')).toHaveText('F');
  }

  test('Diensttausch über zwei Monate und zurück', async ({ page }) => {
    await dienstePinseln(page);
    await expect(zaehlung(page, 'papa')).toHaveText('1 Dienst · 1× F');
    await zelle(page, '2026-12-30').click();
    await tauschKnopf(page, 'papa').click();
    const f = formular(page);
    await expect(f).toBeVisible();
    await f.getByRole('textbox', { name: 'Übernommener Tag', exact: true }).fill('04.01.2027');
    await expect(f.getByRole('status')).toHaveText('Ersetzt am 04.01.: Schulung');
    await f.getByRole('textbox', { name: 'Mit wem (optional)' }).fill('Kollege');
    await f.getByRole('button', { name: 'Speichern' }).click();
    await expect(f).toHaveCount(0);
    // beide Tage zeigen ⇄ (Raster und Tagesblatt); der Dezember hat keinen Dienst mehr
    await expect(karte(page, 'papa').locator('.sp-tag-tausch')).toContainText('⇄ getauscht mit Kollege / gegen 04.01.');
    await expect(tauschKnopf(page, 'papa')).toHaveCount(0);
    await blattAm(page, 'Mittwoch, 30. Dezember').getByRole('button', { name: 'Schließen' }).click();
    await expect(zelle(page, '2026-12-30').locator('.sp-tausch')).toHaveText('⇄');
    await expect(zaehlung(page, 'papa')).toHaveText('Noch nichts eingetragen');
    await expect(streifen(page, '2026-12-30', 'papa')).toHaveClass(/leer/);
    await vor(page);
    await expect(zelle(page, '2027-01-04').locator('.sp-tausch')).toHaveText('⇄');
    await expect(streifen(page, '2027-01-04', 'papa')).toHaveText('F');
    await expect(zaehlung(page, 'papa')).toHaveText('1 Dienst · 1× F');
    // Rückgängig aus dem Tag B: der Text nennt die Rückkehr beider Tage, danach ist alles wie vorher (auch die Schulung in B)
    await zelle(page, '2027-01-04').click();
    await expect(karte(page, 'papa').locator('.sp-tag-tausch')).toContainText('⇄ getauscht mit Kollege / gegen 30.12.');
    await tauschZuruecknehmen(page);
    await blattAm(page, 'Montag, 4. Januar').getByRole('button', { name: 'Schließen' }).click();
    await expect(zelle(page, '2027-01-04').locator('.sp-tausch')).toHaveCount(0);
    await expect(streifen(page, '2027-01-04', 'papa')).toHaveText('S');
    await expect(zaehlung(page, 'papa')).toHaveText('1 Dienst · 1× S');
    await zurueck(page);
    await expect(streifen(page, '2026-12-30', 'papa')).toHaveText('F');
    await expect(zelle(page, '2026-12-30').locator('.sp-tausch')).toHaveCount(0);
    await expect(zaehlung(page, 'papa')).toHaveText('1 Dienst · 1× F');
  });

  test('Diensttausch drei Monate auseinander: nach dem Neustart ⇄ an beiden Tagen, Rückgängig geht', async ({ page }) => {
    await dienstePinseln(page); // 30.12. Frühdienst; B = 10.03.2027 ist leer
    await zelle(page, '2026-12-30').click();
    await tauschKnopf(page, 'papa').click();
    const f = formular(page);
    await f.getByRole('textbox', { name: 'Übernommener Tag', exact: true }).fill('10.03.2027');
    await f.getByRole('button', { name: 'Speichern' }).click();
    await expect(f).toHaveCount(0);
    await expect(karte(page, 'papa').locator('.sp-tag-tausch')).toContainText('⇄ getauscht / gegen 10.03.');
    // Kaltstart: geladen werden nur Monate rund um den gezeigten; den März liest erst der Tausch nach
    await page.reload();
    await expect(monatsSeite(page)).toHaveText('Oktober 2026');
    await vor(page);
    await vor(page);
    await expect(monatsSeite(page)).toHaveText('Dezember 2026');
    await expect(zelle(page, '2026-12-30').locator('.sp-tausch')).toHaveText('⇄');
    await zelle(page, '2026-12-30').click();
    await expect(karte(page, 'papa').locator('.sp-tag-tausch')).toContainText('⇄ getauscht / gegen 10.03.');
    await tauschZuruecknehmen(page);
    await blattAm(page, 'Mittwoch, 30. Dezember').getByRole('button', { name: 'Schließen' }).click();
    await expect(streifen(page, '2026-12-30', 'papa')).toHaveText('F');
    await expect(zelle(page, '2026-12-30').locator('.sp-tausch')).toHaveCount(0);
    await vor(page);
    await vor(page);
    await vor(page);
    await expect(monatsSeite(page)).toHaveText('März 2027');
    await expect(streifen(page, '2027-03-10', 'papa')).toHaveClass(/leer/);
    await expect(zelle(page, '2027-03-10').locator('.sp-tausch')).toHaveCount(0);
  });

  test('Ein schon getauschter Tag bietet keinen zweiten Tausch an', async ({ page }) => {
    await dienstePinseln(page);
    await zelle(page, '2026-12-30').click();
    await tauschKnopf(page, 'papa').click();
    await formular(page).getByRole('textbox', { name: 'Übernommener Tag', exact: true }).fill('04.01.2027');
    await formular(page).getByRole('button', { name: 'Speichern' }).click();
    await expect(formular(page)).toHaveCount(0);
    await expect(karte(page, 'papa').locator('.sp-tag-tausch')).toContainText('⇄ getauscht');
    await expect(tauschKnopf(page, 'papa')).toHaveCount(0); // Tag A (jetzt frei, getauscht)
    await blattAm(page, 'Mittwoch, 30. Dezember').getByRole('button', { name: 'Schließen' }).click();
    await vor(page);
    await zelle(page, '2027-01-04').click();
    await expect(tauschKnopf(page, 'papa')).toHaveCount(0); // Tag B
    await expect(karte(page, 'papa').getByRole('button', { name: 'Tausch rückgängig' })).toBeVisible();
  });

  test('Formular nennt, was am übernommenen Tag ersetzt wird; ein leerer Tag und derselbe Dienst werden gemeldet', async ({ page }) => {
    await dienstePinseln(page);
    await zelle(page, '2026-12-30').click();
    await tauschKnopf(page, 'papa').click();
    const f = formular(page);
    const tag = f.getByRole('textbox', { name: 'Übernommener Tag', exact: true });
    await expect(f.getByText('Abgegebener Tag')).toBeVisible();
    await expect(f.locator('.sp-tausch-tag')).toHaveText('Mittwoch, 30. Dezember');
    await expect(f.getByRole('combobox', { name: 'Person' })).toHaveValue('papa');
    // Urlaub wird nicht angeboten
    await expect(f.getByRole('combobox', { name: 'Dienst am übernommenen Tag' }).locator('option')).toHaveText(['F Frühdienst', 'M Mittagsdienst', 'NM Nachmittagsdienst', 'N Nacht', '2T 2Teiler', 'Ü Überstunde', 'S Schulung', 'E Ersatzdienst']);
    await tag.fill('04.01.2027');
    await expect(f.getByRole('status')).toHaveText('Ersetzt am 04.01.: Schulung');
    await tag.fill('05.01.2027');
    await expect(f.getByRole('status')).toHaveText('Am 05.01. ist kein Dienst eingetragen – nichts wird ersetzt.');
    await f.getByRole('combobox', { name: 'Dienst am übernommenen Tag' }).selectOption({ label: 'S Schulung' });
    await tag.fill('04.01.2027');
    await expect(f.getByRole('status')).toHaveText('Am übernommenen Tag steht schon dieser Dienst.');
    // „Mit wem“: höchstens 24 Zeichen
    const wer = f.getByRole('textbox', { name: 'Mit wem (optional)' });
    await wer.fill('x'.repeat(40));
    await expect(wer).toHaveValue('x'.repeat(24));
    await f.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(f).toHaveCount(0);
    await expect(zelle(page, '2026-12-30').locator('.sp-tausch')).toHaveCount(0); // nichts gespeichert
  });
  test('auf 360 px ragt das Formular „Diensttausch“ und die Tauschzeile nicht seitwärts hinaus', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await dienstePinseln(page);
    await zelle(page, '2026-12-30').click();
    await tauschKnopf(page, 'papa').click();
    const f = formular(page);
    await f.getByRole('textbox', { name: 'Übernommener Tag', exact: true }).fill('04.01.2027');
    await f.getByRole('textbox', { name: 'Mit wem (optional)' }).fill('x'.repeat(24));
    const passt = () =>
      page.evaluate(() => {
        const b = document.querySelector('.blatt');
        return { scroll: b.scrollWidth, breite: b.clientWidth, rechts: Math.max(...[...b.querySelectorAll('button, input:not(.picker-unsichtbar), select')].map((e) => e.getBoundingClientRect().right)) };
      });
    let m = await passt();
    expect(m.scroll).toBeLessThanOrEqual(m.breite);
    expect(m.rechts).toBeLessThanOrEqual(360);
    await f.getByRole('button', { name: 'Speichern' }).click();
    await expect(karte(page, 'papa').locator('.sp-tag-tausch')).toContainText('⇄ getauscht mit xxxxxxxxxxxxxxxxxxxxxxxx / gegen 04.01.');
    m = await passt();
    expect(m.scroll).toBeLessThanOrEqual(m.breite);
    expect(m.rechts).toBeLessThanOrEqual(360);
  });
});
