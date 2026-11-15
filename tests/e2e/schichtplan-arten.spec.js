// Schichtplan: „Schichtarten bearbeiten“ (Demo) und mit Google (Attrappe).
import { test, expect, starteDemo, starteGoogleVerbunden, fehlerToastsZaehlen, NETZFEHLER } from './hilfen.js';
import { standardKatalog } from '../../src/domain/schicht.js';
import { streifen, zelle } from './schichtplan-hilfen.js';

test.describe('Schichtarten bearbeiten', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  const blatt = (page) => page.getByRole('dialog', { name: 'Schichtarten' });
  const abschnitt = (page, person) => page.locator(`.sp-arten-person[data-person="${person}"]`);
  const zeilen = (page, person) => abschnitt(page, person).locator('.sp-arten-liste.aktiv .sp-art-zeile');
  const formular = (page) => page.locator('.sp-art-form');
  const pinselArten = (page) => page.locator('.sp-pinsel .sp-pinsel-arten button');
  const katalog = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('fk.demo.v1')).schicht.katalog);
  const oeffnen = async (page) => {
    await page.getByRole('button', { name: 'Schichtarten bearbeiten' }).click();
    await expect(blatt(page)).toBeVisible();
  };
  const schliessen = async (page) => {
    await blatt(page).getByRole('button', { name: 'Schließen' }).click();
    await expect(blatt(page)).toHaveCount(0);
  };

  test('öffnet vom Knopf der Seite: Papa und Mama mit ihren Arten (Kürzel farbig, Name, Zeiten)', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await oeffnen(page);
    await expect(blatt(page).getByRole('heading', { name: 'Schichtarten' })).toBeVisible();
    await expect(abschnitt(page, 'papa').locator('h3')).toHaveText('👨 Papa');
    await expect(abschnitt(page, 'mama').locator('h3')).toHaveText('👩 Mama');
    await expect(zeilen(page, 'papa').locator('.sp-art-text')).toHaveText(['Frühdienst', 'Mittagsdienst', 'Nachmittagsdienst', 'Nacht ☾', '2Teiler', 'Überstunde', 'Schulung', 'Urlaub', 'Ersatzdienst']);
    await expect(zeilen(page, 'mama').locator('.sp-art-text')).toHaveText([
      'Tagdienst 07:00–17:45',
      'Nachtdienst 17:30–07:00 ☾',
      'Schulung',
      'Überstunde',
      'Urlaub',
      'Dienstbesprechung 18:00–19:30 · Zusatz',
    ]);
    await expect(zeilen(page, 'papa').first().locator('.sp-art-kuerzel')).toHaveText('F');
    await expect(zeilen(page, 'papa').first().locator('.sp-art-kuerzel')).toHaveClass(/sf-gruen/);
    await expect(zeilen(page, 'papa').filter({ hasText: 'Urlaub' }).locator('.sp-art-kuerzel')).toHaveClass(/gestreift muster-urlaub/);
    await expect(blatt(page).getByRole('button', { name: 'Frühdienst nach oben' })).toBeDisabled();
    await expect(abschnitt(page, 'papa').getByRole('button', { name: 'Ersatzdienst nach unten' })).toBeDisabled(); // E steht als letzte Art von Papa
    await expect(abschnitt(page, 'papa').getByRole('button', { name: '＋ Neue Art' })).toBeVisible();
    await expect(abschnitt(page, 'papa').locator('.sp-arten-aus')).toHaveCount(0); // nichts ausgeblendet: kein Abschnitt
    const masse = await page.evaluate(() => {
      const b = document.querySelector('.blatt');
      return { scroll: b.scrollWidth, breite: b.clientWidth, rechts: Math.max(...[...b.querySelectorAll('button')].map((e) => e.getBoundingClientRect().right)) };
    });
    expect(masse.scroll).toBeLessThanOrEqual(masse.breite);
    expect(masse.rechts).toBeLessThanOrEqual(375);
  });

  test('Papa „Bergbahn“ (B, Braun) anlegen → Legende und Pinsel; Kürzel „f“ gibt es schon; ausblenden und wiederherstellen', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await oeffnen(page);
    await abschnitt(page, 'papa').getByRole('button', { name: '＋ Neue Art' }).click();
    await expect(formular(page)).toBeVisible();
    await expect(formular(page).getByRole('heading')).toHaveText('Neue Art · 👨 Papa');
    await expect(formular(page).getByRole('button', { name: 'Dienst', exact: true })).toHaveAttribute('aria-pressed', 'true');
    // 16 Farben mit Namen; die gewählte trägt ✓ und aria-pressed
    await expect(formular(page).getByRole('group', { name: 'Farbe' }).getByRole('button')).toHaveCount(16);
    await formular(page).getByRole('textbox', { name: 'Name' }).fill('Bergbahn');
    await formular(page).getByRole('textbox', { name: 'Kürzel' }).fill('f');
    await formular(page).getByRole('button', { name: 'Braun' }).click();
    await expect(formular(page).getByRole('button', { name: 'Braun' })).toHaveAttribute('aria-pressed', 'true');
    await expect(formular(page).getByRole('button', { name: 'Braun' })).toHaveText('✓');
    await expect(formular(page).getByRole('button', { name: 'Braun' })).toHaveClass(/sf-braun/);
    await expect(formular(page).locator('.sp-farbe[aria-pressed="true"]')).toHaveCount(1);
    await formular(page).getByRole('button', { name: 'Speichern' }).click();
    await expect(page.locator('.toast.fehler')).toHaveText('Dieses Kürzel gibt es schon.');
    await expect(formular(page)).toBeVisible(); // bleibt offen, die Eingabe steht noch da
    await expect(formular(page).getByRole('textbox', { name: 'Name' })).toHaveValue('Bergbahn');
    await expect(formular(page).getByRole('button', { name: 'Braun' })).toHaveAttribute('aria-pressed', 'true');
    await formular(page).getByRole('textbox', { name: 'Kürzel' }).fill('B');
    await formular(page).getByRole('button', { name: 'Speichern' }).click();
    await expect(formular(page)).toHaveCount(0);
    await expect(zeilen(page, 'papa').last().locator('.sp-art-text')).toHaveText('Bergbahn');
    await expect(zeilen(page, 'papa').last().locator('.sp-art-kuerzel')).toHaveClass(/sf-braun/);
    await expect.poll(async () => (await katalog(page)).arten.papa.at(-1)).toMatchObject({ kuerzel: 'B', name: 'Bergbahn', farbe: 'braun', gruppe: 'dienst' });
    await schliessen(page);
    await expect(page.locator('.sp-legende')).toContainText('Bergbahn');
    await expect(page.locator('.sp-legende .sp-lg-kuerzel.sf-braun')).toHaveText('B');
    await page.getByRole('button', { name: '✏️ Eintragen' }).click();
    await expect(pinselArten(page).nth(-2)).toHaveText('B Bergbahn');
    await expect(page.locator('.sp-pinsel').getByRole('button', { name: 'B Bergbahn' }).locator('.sp-pinsel-kuerzel')).toHaveClass(/sf-braun/);

    // „Entfernen“ blendet aus: weg aus Pinsel und Liste, steht unter „Ausgeblendet (1)“; „Wiederherstellen“ holt es zurück
    await oeffnen(page);
    await blatt(page).getByRole('button', { name: 'Bergbahn entfernen' }).click();
    await expect(page.locator('.sp-pinsel').getByRole('button', { name: 'B Bergbahn' })).toHaveCount(0);
    await expect(zeilen(page, 'papa').locator('.sp-art-text')).not.toContainText(['Bergbahn']);
    const ausgeblendet = abschnitt(page, 'papa').locator('.sp-arten-aus');
    await expect(ausgeblendet.locator('summary')).toHaveText('Ausgeblendet (1)');
    await ausgeblendet.locator('summary').click();
    await expect(ausgeblendet.locator('.sp-art-zeile .sp-art-text')).toHaveText(['Bergbahn']);
    await expect.poll(async () => (await katalog(page)).arten.papa.at(-1).archiv).toBe(true);
    await ausgeblendet.getByRole('button', { name: 'Bergbahn wiederherstellen' }).click();
    await expect(abschnitt(page, 'papa').locator('.sp-arten-aus')).toHaveCount(0);
    await expect(zeilen(page, 'papa').last().locator('.sp-art-text')).toHaveText('Bergbahn');
    await expect(page.locator('.sp-pinsel').getByRole('button', { name: 'B Bergbahn' })).toHaveCount(1);
    await expect.poll(async () => (await katalog(page)).arten.papa.at(-1).archiv ?? false).toBe(false);
  });

  test('Farbe von „F“ auf „Oliv“: der Streifen F im Raster wechselt die Farbe; Urlaub umbenannt bleibt gestreift', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await expect(streifen(page, '2026-10-05', 'papa')).toHaveClass(/sf-gruen/);
    await oeffnen(page);
    await blatt(page).getByRole('button', { name: 'Frühdienst bearbeiten' }).click();
    await expect(formular(page).getByRole('heading')).toHaveText('Frühdienst · 👨 Papa');
    await expect(formular(page).getByRole('textbox', { name: 'Name' })).toHaveValue('Frühdienst');
    await expect(formular(page).getByRole('textbox', { name: 'Kürzel' })).toHaveValue('F');
    await expect(formular(page).getByRole('button', { name: 'Grün' })).toHaveAttribute('aria-pressed', 'true');
    await formular(page).getByRole('button', { name: 'Oliv' }).click();
    await expect(formular(page).getByRole('button', { name: 'Grün' })).toHaveAttribute('aria-pressed', 'false');
    await formular(page).getByRole('button', { name: 'Speichern' }).click();
    await expect(formular(page)).toHaveCount(0);
    await expect(streifen(page, '2026-10-05', 'papa')).toHaveClass(/sf-oliv/);
    await expect(streifen(page, '2026-10-05', 'papa')).not.toHaveClass(/sf-gruen/);
    await expect(zeilen(page, 'papa').first().locator('.sp-art-kuerzel')).toHaveClass(/sf-oliv/);

    // Urlaub umbenennen: das Muster (gestreift) bleibt
    await abschnitt(page, 'papa').getByRole('button', { name: 'Urlaub bearbeiten' }).click();
    await formular(page).getByRole('textbox', { name: 'Name' }).fill('Ferien');
    await formular(page).getByRole('button', { name: 'Speichern' }).click();
    await expect.poll(async () => (await katalog(page)).arten.papa.find((a) => a.kuerzel === 'U')).toMatchObject({ name: 'Ferien', muster: 'urlaub' });
    await expect(zeilen(page, 'papa').filter({ hasText: 'Ferien' }).locator('.sp-art-kuerzel')).toHaveClass(/gestreift muster-urlaub/);
  });

  test('↓ auf der ersten Art ändert die Reihenfolge im Pinsel; eine ausgeblendete dazwischen wird übersprungen', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await page.getByRole('button', { name: '✏️ Eintragen' }).click();
    await expect(pinselArten(page).first()).toHaveText('F Frühdienst');
    await oeffnen(page);
    await blatt(page).getByRole('button', { name: 'Frühdienst nach unten' }).click();
    await expect(zeilen(page, 'papa').locator('.sp-art-text').first()).toHaveText('Mittagsdienst');
    await expect(pinselArten(page).nth(0)).toHaveText('M Mittagsdienst');
    await expect(pinselArten(page).nth(1)).toHaveText('F Frühdienst');
    await expect.poll(async () => (await katalog(page)).arten.papa.slice(0, 2).map((a) => a.kuerzel)).toEqual(['M', 'F']);
    await expect(blatt(page).getByRole('button', { name: 'Mittagsdienst nach oben', exact: true })).toBeDisabled();

    // NM ausblenden: F ↓ springt mit einem Tipp an NM vorbei hinter N
    await blatt(page).getByRole('button', { name: 'Nachmittagsdienst entfernen' }).click();
    await expect(zeilen(page, 'papa').locator('.sp-art-kuerzel')).toHaveText(['M', 'F', 'N', '2T', 'Ü', 'S', 'U', 'E']);
    await blatt(page).getByRole('button', { name: 'Frühdienst nach unten' }).click();
    await expect(zeilen(page, 'papa').locator('.sp-art-kuerzel')).toHaveText(['M', 'N', 'F', '2T', 'Ü', 'S', 'U', 'E']);
    await expect(pinselArten(page).nth(1)).toHaveText('N Nacht');
    await expect(pinselArten(page).nth(2)).toHaveText('F Frühdienst');
  });

  test('Zusatz ohne Zeiten → „Ein Zusatz braucht Von und Bis.“; mit Zeiten und Nacht ☾ gespeichert; Abbrechen ändert nichts', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await oeffnen(page);
    await abschnitt(page, 'papa').getByRole('button', { name: '＋ Neue Art' }).click();
    await formular(page).getByRole('textbox', { name: 'Name' }).fill('Bereitschaft');
    await formular(page).getByRole('textbox', { name: 'Kürzel' }).fill('BR');
    await formular(page).getByRole('button', { name: 'Zusatz', exact: true }).click();
    await expect(formular(page).getByRole('button', { name: 'Zusatz', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(formular(page).getByRole('button', { name: 'Dienst', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(formular(page).getByRole('checkbox', { name: '🔔 Erinnern (1 Tag und 1 Stunde vorher)' })).toBeChecked(); // neu als Zusatz: an
    await formular(page).getByRole('button', { name: 'Speichern' }).click();
    await expect(page.locator('.toast.fehler')).toHaveText('Ein Zusatz braucht Von und Bis.');
    await expect(formular(page)).toBeVisible();
    await formular(page).getByRole('textbox', { name: 'Von', exact: true }).fill('22:00');
    await formular(page).getByRole('textbox', { name: 'Bis', exact: true }).fill('06:00');
    await formular(page).getByRole('checkbox', { name: 'Nacht ☾' }).check();
    await formular(page).getByRole('button', { name: 'Speichern' }).click();
    await expect(formular(page)).toHaveCount(0);
    await expect(zeilen(page, 'papa').last().locator('.sp-art-text')).toHaveText('Bereitschaft 22:00–06:00 ☾ · Zusatz');
    await expect.poll(async () => (await katalog(page)).arten.papa.at(-1)).toMatchObject({ kuerzel: 'BR', gruppe: 'zusatz', von: '22:00', bis: '06:00', nacht: true, erinnern: true });

    // Bearbeiten und Abbrechen: nichts ändert sich
    await abschnitt(page, 'mama').getByRole('button', { name: 'Tagdienst bearbeiten' }).click();
    await formular(page).getByRole('textbox', { name: 'Name' }).fill('Etwas anderes');
    await formular(page).getByRole('button', { name: 'Abbrechen' }).click();
    await expect(formular(page)).toHaveCount(0);
    await expect(zeilen(page, 'mama').first().locator('.sp-art-text')).toHaveText('Tagdienst 07:00–17:45');
  });
  test.describe('mit Google (Attrappe)', () => {
    test.use({ erlaubteFehler: NETZFEHLER }); // fehlende versteckte Ereignisse antworten 404

    test('das andere Telefon hat „B“ gerade vergeben (Google): „Dieses Kürzel gibt es schon.“, das Formular bleibt mit der Eingabe offen', async ({ page }) => {
      const google = await starteGoogleVerbunden(page, { route: '#/schicht' });
      await oeffnen(page);
      await abschnitt(page, 'papa').getByRole('button', { name: '＋ Neue Art' }).click();
      await formular(page).getByRole('textbox', { name: 'Name' }).fill('Bergbahn');
      await formular(page).getByRole('textbox', { name: 'Kürzel' }).fill('B');
      await formular(page).getByRole('button', { name: 'Braun' }).click();
      // inzwischen legt das andere Telefon „B Bereitschaft“ an; dieses Telefon zeigt noch die alten Arten
      const fremd = standardKatalog();
      fremd.arten.papa.push({ k: 'J', kuerzel: 'B', name: 'Bereitschaft', farbe: 'grau', gruppe: 'dienst' });
      google.setzeSchichtarten(fremd);
      const toasts = await fehlerToastsZaehlen(page);
      await formular(page).getByRole('button', { name: 'Speichern' }).click();
      await expect(page.locator('.toast.fehler')).toHaveText('Dieses Kürzel gibt es schon.');
      await page.waitForTimeout(600);
      expect(await toasts.anzahl(), 'genau eine Fehlermeldung').toBe(1);
      await expect(formular(page)).toBeVisible();
      await expect(formular(page).getByRole('textbox', { name: 'Name' })).toHaveValue('Bergbahn');
      await expect(formular(page).getByRole('textbox', { name: 'Kürzel' })).toHaveValue('B');
      await expect(formular(page).getByRole('button', { name: 'Braun' })).toHaveAttribute('aria-pressed', 'true');
      await expect(formular(page).getByRole('button', { name: 'Speichern' })).toBeEnabled();
      // ein anderes Kürzel: gespeichert, das Formular schließt; beide Arten stehen in der Liste
      await formular(page).getByRole('textbox', { name: 'Kürzel' }).fill('BB');
      await formular(page).getByRole('button', { name: 'Speichern' }).click();
      await expect(formular(page)).toHaveCount(0);
      await expect(zeilen(page, 'papa').locator('.sp-art-text')).toContainText(['Bereitschaft', 'Bergbahn']);
    });
  });

  test('eine unlesbare Uhrzeit wird gemeldet und nie still weggelassen', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await oeffnen(page);
    await abschnitt(page, 'papa').getByRole('button', { name: '＋ Neue Art' }).click();
    await formular(page).getByRole('textbox', { name: 'Name' }).fill('Spät');
    await formular(page).getByRole('textbox', { name: 'Kürzel' }).fill('SP');
    await formular(page).getByRole('textbox', { name: 'Von', exact: true }).fill('99');
    await formular(page).getByRole('textbox', { name: 'Bis', exact: true }).fill('99');
    await formular(page).getByRole('button', { name: 'Speichern' }).click();
    await expect(page.locator('.toast.fehler')).toHaveText('Bitte eine Uhrzeit wie 07:30 eingeben.');
    await expect(formular(page)).toBeVisible();
    await formular(page).getByRole('textbox', { name: 'Von', exact: true }).fill('');
    await formular(page).getByRole('textbox', { name: 'Bis', exact: true }).fill('');
    await formular(page).getByRole('button', { name: 'Speichern' }).click();
    await expect(formular(page)).toHaveCount(0);
    await expect(zeilen(page, 'papa').last().locator('.sp-art-text')).toHaveText('Spät');
  });

  test('„🔔 Erinnern“ nur bei Zusatz: bei DB angehakt, abhaken bleibt nach dem Neuladen; im Tagesblatt fehlt dann der Hinweis', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    const erinnern = () => formular(page).getByRole('checkbox', { name: '🔔 Erinnern (1 Tag und 1 Stunde vorher)' });
    await oeffnen(page);
    // ein Dienst hat keine Erinnerung; wechselt das Formular auf „Zusatz“, erscheint sie (angehakt)
    await abschnitt(page, 'mama').getByRole('button', { name: 'Tagdienst bearbeiten' }).click();
    await expect(formular(page)).toBeVisible();
    await expect(erinnern()).toBeHidden();
    await formular(page).getByRole('button', { name: 'Zusatz', exact: true }).click();
    await expect(erinnern()).toBeVisible();
    await expect(erinnern()).toBeChecked();
    await formular(page).getByRole('button', { name: 'Dienst', exact: true }).click();
    await expect(erinnern()).toBeHidden();
    await formular(page).getByRole('button', { name: 'Abbrechen' }).click();

    await abschnitt(page, 'mama').getByRole('button', { name: 'Dienstbesprechung bearbeiten' }).click();
    await expect(erinnern()).toBeChecked();
    await erinnern().uncheck();
    await formular(page).getByRole('button', { name: 'Speichern' }).click();
    await expect(formular(page)).toHaveCount(0);
    await expect.poll(async () => (await katalog(page)).arten.mama.find((a) => a.kuerzel === 'DB').erinnern).toBe(false);
    await page.reload();
    await oeffnen(page);
    await abschnitt(page, 'mama').getByRole('button', { name: 'Dienstbesprechung bearbeiten' }).click();
    await expect(erinnern()).not.toBeChecked();
    await formular(page).getByRole('button', { name: 'Abbrechen' }).click();
    await schliessen(page);
    await zelle(page, '2026-10-23').click();
    await page.locator('.sp-tag-karte[data-person="mama"]').getByRole('button', { name: '＋ Dienstbesprechung' }).click();
    await expect(page.locator('.sp-tag-karte[data-person="mama"] .sp-tag-zusatz-form')).toBeVisible();
    await expect(page.locator('.sp-tag-erinnerung')).toHaveCount(0);
  });

  test('nach dem Neuladen ist alles noch da: neue Art, Reihenfolge, ausgeblendet', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await oeffnen(page);
    await abschnitt(page, 'papa').getByRole('button', { name: '＋ Neue Art' }).click();
    await formular(page).getByRole('textbox', { name: 'Name' }).fill('Bergbahn');
    await formular(page).getByRole('textbox', { name: 'Kürzel' }).fill('B');
    await formular(page).getByRole('button', { name: 'Speichern' }).click();
    await expect(formular(page)).toHaveCount(0);
    await blatt(page).getByRole('button', { name: 'Frühdienst nach unten' }).click();
    await abschnitt(page, 'papa').getByRole('button', { name: 'Schulung entfernen' }).click();
    await expect(zeilen(page, 'papa').locator('.sp-art-kuerzel')).toHaveText(['M', 'F', 'NM', 'N', '2T', 'Ü', 'U', 'E', 'B']);
    await page.reload();
    await oeffnen(page);
    await expect(zeilen(page, 'papa').locator('.sp-art-kuerzel')).toHaveText(['M', 'F', 'NM', 'N', '2T', 'Ü', 'U', 'E', 'B']);
    await expect(abschnitt(page, 'papa').locator('.sp-arten-aus summary')).toHaveText('Ausgeblendet (1)');
    await schliessen(page);
    await page.getByRole('button', { name: '✏️ Eintragen' }).click();
    await expect(pinselArten(page)).toHaveText(['M Mittagsdienst', 'F Frühdienst', 'NM Nachmittagsdienst', 'N Nacht', '2T 2Teiler', 'Ü Überstunde', 'U Urlaub', 'E Ersatzdienst', 'B Bergbahn', '– Frei']);
  });
});
