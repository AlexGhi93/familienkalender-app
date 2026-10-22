// „Fixkosten“ im Konto-Tab (Demo, Mittwoch 14.10.2026): Umschalter „Kontostand · Fixkosten“ (gemerkt), Kopf mit Summen, Filter mit
// Teilsummen, „Diesen Monat fällig“ ohne Haken, Kategorien, „Kündbar bis“ mit ⚠ ab 60 Tagen, „monatlich kündbar“, Formular mit Vorlage,
// Intervall und berechnetem „Kündbar bis“, Archivieren (fällt aus den Summen), Zurückholen, „Endgültig löschen“ mit Rückfrage, Neuladen,
// Ziel der Erinnerungen (#/konto/fixkosten), „Beispieldaten entfernen“, unlesbare Teile / ausgeblendete Posten / Warnungen (Google).
// Die Demo-Fixkosten (src/app/seed.js) sind erfunden.
import { test, expect, starteDemo, starteGoogleVerbunden, erwarteToast, NETZFEHLER } from './hilfen.js';
import { TEXT_TEIL_GESPERRT } from '../../src/domain/fixkosten.js';

test.use({ viewport: { width: 375, height: 812 } });

const kopf = (page) => page.locator('.fk-kopf');
const gross = (page) => kopf(page).locator('.fk-gross');
const filter = (page) => page.getByRole('group', { name: 'Wessen Fixkosten' });
const karte = (page, titel) => page.locator('.fk-karte').filter({ has: page.locator('.fk-karte-titel > span', { hasText: titel }) });
const zeile = (page, karteTitel, name) => karte(page, karteTitel).locator('.fk-pos').filter({ has: page.locator('.fk-n > b', { hasText: new RegExp(`^${name}$`) }) });
const dialog = (page, name) => page.getByRole('dialog', { name });

async function oeffneFixkosten(page, optionen = {}) {
  await starteDemo(page, { route: '#/konto', ...optionen });
  await page.getByRole('group', { name: 'Ansicht im Konto' }).getByRole('button', { name: 'Fixkosten' }).click();
  await expect(page.getByRole('heading', { name: 'Fixkosten 💶' })).toBeVisible();
}

test.describe('Fixkosten im Konto-Tab', () => {
  test('Umschalter Kontostand · Fixkosten: gemerkt nach dem Neuladen; der Kontostand bleibt wie er war', async ({ page }) => {
    await starteDemo(page, { route: '#/konto' });
    const umschalter = page.getByRole('group', { name: 'Ansicht im Konto' });
    await expect(umschalter.getByRole('button')).toHaveText(['Kontostand', 'Fixkosten']);
    await expect(umschalter.getByRole('button', { name: 'Kontostand' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { name: 'Kontostand 💶' })).toBeVisible();
    await expect(page).toHaveTitle('Familienkalender · Kontostand');

    await umschalter.getByRole('button', { name: 'Fixkosten' }).click();
    await expect(page.getByRole('heading', { name: 'Fixkosten 💶' })).toBeVisible();
    await expect(page).toHaveTitle('Familienkalender · Fixkosten');
    expect(await page.evaluate(() => localStorage.getItem('fk.konto.ansicht.v1'))).toBe('fixkosten');

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Fixkosten 💶' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Ansicht im Konto' }).getByRole('button', { name: 'Fixkosten' })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('group', { name: 'Ansicht im Konto' }).getByRole('button', { name: 'Kontostand' }).click();
    await expect(page.getByRole('heading', { name: 'Kontostand 💶' })).toBeVisible();
    await expect(page.locator('.konto-kachel-wert')).toHaveText(['+4.213,50 €', '+1.053,38 €', '3 von 4']);
    expect(await page.evaluate(() => localStorage.getItem('fk.konto.ansicht.v1'))).toBe('kontostand');
  });

  test('Kopf mit Summen und Ø Ersparnis; Filter mit Teilsummen', async ({ page }) => {
    await oeffneFixkosten(page);
    await expect(kopf(page).locator('.fk-klein').first()).toHaveText('Fixkosten pro Monat (Ø)');
    await expect(gross(page)).toHaveText('1.459,39 €');
    await expect(kopf(page)).toContainText('= 17.512,68 € im Jahr · 12 Posten');
    await expect(kopf(page).locator('.fk-kopf-zeile')).toHaveText(['Diesen Monat fällig1.545,69 €', 'Ø Ersparnis (6 Monate, aus Kontostand)+1.053,38 €']);

    await expect(filter(page).getByRole('button')).toHaveText(['Alle 1.459,39 €', '👨 Papa 100,30 €', '👩 Mama 44,90 €', '🏠 Gemeinsam 1.282,19 €', '👧 Kind 32 €']);
    await expect(filter(page).getByRole('button', { name: /^Alle/ })).toHaveAttribute('aria-pressed', 'true');

    await filter(page).getByRole('button', { name: /Papa/ }).click();
    await expect(filter(page).getByRole('button', { name: /Papa/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(kopf(page).locator('.fk-klein').first()).toHaveText('Fixkosten pro Monat (Ø) · 👨 Papa');
    await expect(gross(page)).toHaveText('100,30 €');
    await expect(kopf(page)).toContainText('= 1.203,60 € im Jahr · 3 Posten');
    await expect(kopf(page).locator('.fk-kopf-zeile').first()).toHaveText('Diesen Monat fällig112,90 €');
    await expect(page.locator('.fk-kategorie .fk-karte-titel > span')).toHaveText(['🛡️ Versicherungen', '🏦 Bank & Gebühren', '📦 Sonstiges']);
    await expect(karte(page, 'Diesen Monat fällig').locator('.fk-n > b')).toHaveText(['Kfz-Versicherung Papa', 'Friseur', 'Kontoführung']);
    // die Filterknöpfe zeigen weiter alle Teilsummen
    await expect(filter(page).getByRole('button', { name: /^Alle/ })).toHaveText('Alle 1.459,39 €');
  });

  test('„Diesen Monat fällig“ nach Tag, ohne offen/bezahlt; Kategorien mit Teilsumme; Kündbar bis mit ⚠; Fristen, Diagramm, Archiv', async ({ page }) => {
    await oeffneFixkosten(page);
    const faellig = karte(page, 'Diesen Monat fällig');
    await expect(faellig.locator('.fk-karte-titel small')).toHaveText('1.545,69 €');
    await expect(faellig.locator('.fk-tag')).toHaveText(['1.', '1.', '5.', '10.', '10.', '15.', '20.', '25.', '28.', '31.', '31.']);
    await expect(faellig.locator('.fk-pos').first()).toContainText('Kfz-Versicherung Papa');
    await expect(faellig.locator('.fk-pos').nth(6)).toContainText('Fernwärme🏠 Gemeinsam · alle 2 Monate~ 178 €');
    await expect(faellig.locator('input, [role="checkbox"]')).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText(/bezahlt|offen \d/);

    await expect(page.locator('.fk-kategorie .fk-karte-titel > span')).toHaveText(['🏠 Wohnen & Energie', '🛡️ Versicherungen', '📱 Kommunikation', '🎬 Freizeit & Abos', '🏦 Bank & Gebühren', '📦 Sonstiges']);
    await expect(page.locator('.fk-kategorie .fk-karte-titel > small')).toHaveText(['1.228,30 €', '91 €', '54,90 €', '43,89 €', '6,30 €', '35 €']);
    const fernwaerme = zeile(page, 'Wohnen & Energie', 'Fernwärme');
    await expect(fernwaerme.locator('.fk-n small')).toHaveText('GEM alle 2 Monate 178 € · am 20. · ~ ungefähr');
    await expect(fernwaerme.locator('.fk-b')).toHaveText('~ 89 €pro Monat');

    const kfz = zeile(page, 'Versicherungen', 'Kfz-Versicherung Papa');
    await expect(kfz.locator('.fk-person')).toHaveText('PAPA');
    await expect(kfz.locator('.fk-abzeichen')).toHaveText('⚠ Kündbar bis 30.11. – in 47 Tagen');
    await expect(kfz.locator('.fk-abzeichen')).toHaveClass(/warn/);
    const fitness = zeile(page, 'Freizeit & Abos', 'Fitnessstudio');
    await expect(fitness.locator('.fk-abzeichen')).toHaveText('📝 Kündbar bis 30.04.2027');
    await expect(fitness.locator('.fk-abzeichen')).not.toHaveClass(/warn/);

    const fristen = karte(page, 'Kündigungsfristen');
    await expect(fristen.locator('.fk-karte-titel small')).toHaveText('nächste zuerst');
    await expect(fristen.locator('.fk-n > b')).toHaveText(['Kfz-Versicherung Papa', 'Fitnessstudio']);
    await expect(fristen.locator('.fk-n small')).toHaveText(['Vertrag bis 31.12.2026', 'Vertrag bis 30.06.2027']);

    const diagramm = karte(page, 'Fixkosten und Ersparnis');
    await expect(diagramm.locator('.fk-karte-titel small')).toHaveText('letzte 6 Monate');
    await expect(diagramm.locator('.fk-monat > .fk-klein')).toHaveText(['Oktober 2026', 'September 2026', 'August 2026', 'Juli 2026', 'Juni 2026', 'Mai 2026']);
    await expect(diagramm.locator('.fk-monat').nth(1).locator('.fk-legende')).toHaveText('Fixkosten fällig 1.348,79 €Ersparnis +1.933,50 €');
    await expect(diagramm.locator('.fk-monat').first().locator('.fk-legende')).toHaveText('Fixkosten fällig 1.545,69 €Ersparnis: Kontostand am Monatsende');

    const archiv = karte(page, 'Archiv');
    await expect(archiv.locator('.fk-karte-titel small')).toHaveText('1');
    await expect(archiv.locator('.fk-pos')).toHaveText(['Babyschwimmenarchiviert ab 01.09.2026 · 45 € monatlich—']);
  });

  test('Formular: Vorlage „Kfz-Versicherung“ füllt Kategorie und Frist, Vertrag → „Kündbar bis“ berechnet; gespeichert mit ⚠; bleibt nach dem Neuladen', async ({ page }) => {
    await oeffneFixkosten(page);
    await page.getByRole('button', { name: '＋ Fixkosten eintragen' }).click();
    const d = dialog(page, 'Neue Fixkosten');
    await expect(d.getByRole('group', { name: 'Vorlage (optional)' }).getByRole('button')).toHaveCount(13);
    await d.getByRole('button', { name: '🚗 Kfz-Versicherung' }).click();
    await expect(d.getByRole('button', { name: '🚗 Kfz-Versicherung' })).toHaveAttribute('aria-pressed', 'true');
    await expect(d.getByLabel('Name', { exact: true })).toHaveValue('Kfz-Versicherung');
    await expect(d.getByLabel('Kategorie', { exact: true })).toHaveValue('versicherung');
    await expect(d.getByLabel('Wie oft?', { exact: true })).toHaveValue('1');
    await expect(d.getByRole('checkbox', { name: '📝 Vertrag mit Kündigungsfrist' })).toBeChecked();
    await expect(d.getByLabel('Kündigungsfrist', { exact: true })).toHaveValue('1m');
    await expect(d.getByLabel('Verlängert sich um', { exact: true })).toHaveValue('12');
    await expect(d.locator('.fk-tipp')).toContainText('laut Polizze prüfen');

    await d.getByLabel('Name', { exact: true }).fill('Kfz-Versicherung Mama');
    await d.getByLabel('Betrag in Euro').fill('61,50');
    await d.getByRole('group', { name: 'Gehört zu' }).getByRole('button', { name: '👩 Mama' }).click();
    await d.getByLabel('Vertrag läuft bis', { exact: true }).fill('31.12.2026');
    await expect(d.locator('.fk-vorschau')).toHaveText('→ Kündbar bis 30.11.2026 · 🔔 Erinnerung an beide am 30.10.2026 (1 Monat vorher)');
    await d.getByRole('button', { name: 'Speichern' }).click();
    await erwarteToast(page, 'Gespeichert ✓');
    await expect(d).toBeHidden();

    const neu = zeile(page, 'Versicherungen', 'Kfz-Versicherung Mama');
    await expect(neu.locator('.fk-person')).toHaveText('MAMA');
    await expect(neu.locator('.fk-b')).toHaveText('61,50 €');
    await expect(neu.locator('.fk-abzeichen')).toHaveText('⚠ Kündbar bis 30.11. – in 47 Tagen');
    await expect(gross(page)).toHaveText('1.520,89 €');
    await expect(karte(page, 'Kündigungsfristen').locator('.fk-n > b')).toHaveText(['Kfz-Versicherung Mama', 'Kfz-Versicherung Papa', 'Fitnessstudio']);

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Fixkosten 💶' })).toBeVisible();
    await expect(zeile(page, 'Versicherungen', 'Kfz-Versicherung Mama').locator('.fk-abzeichen')).toHaveText('⚠ Kündbar bis 30.11. – in 47 Tagen');
    await expect(gross(page)).toHaveText('1.520,89 €');

    // ändern: Betrag anpassen, Vertrag entfernen
    await zeile(page, 'Versicherungen', 'Kfz-Versicherung Mama').click();
    const aendern = dialog(page, 'Fixkosten ändern');
    await expect(aendern.getByLabel('Betrag in Euro')).toHaveValue('61,50');
    await expect(aendern.getByRole('group', { name: 'Vorlage (optional)' })).toHaveCount(0);
    await aendern.getByLabel('Betrag in Euro').fill('60');
    await aendern.getByRole('checkbox', { name: '📝 Vertrag mit Kündigungsfrist' }).uncheck();
    await aendern.getByRole('button', { name: 'Speichern' }).click();
    await expect(aendern).toBeHidden();
    await expect(zeile(page, 'Versicherungen', 'Kfz-Versicherung Mama').locator('.fk-b')).toHaveText('60 €');
    await expect(zeile(page, 'Versicherungen', 'Kfz-Versicherung Mama').locator('.fk-abzeichen')).toHaveCount(0);
  });

  test('Formular: „alle 2 Monate“ mit nächster Zahlung; Ø pro Monat; ungültige Eingaben bleiben im Formular', async ({ page }) => {
    await oeffneFixkosten(page);
    await page.getByRole('button', { name: '＋ Fixkosten eintragen' }).click();
    const d = dialog(page, 'Neue Fixkosten');
    await d.getByLabel('Name', { exact: true }).fill('Wasser');
    await d.getByRole('button', { name: 'Speichern' }).click();
    await erwarteToast(page, 'Bitte einen Betrag zwischen 0,01 € und 99.999,99 € eingeben.');
    await expect(d).toBeVisible();

    await d.getByLabel('Betrag in Euro').fill('120');
    await expect(d.getByLabel('Nächste Zahlung im', { exact: true })).toHaveCount(0);
    await d.getByLabel('Wie oft?', { exact: true }).selectOption({ label: 'alle 2 Monate' });
    await expect(d.getByLabel('Name', { exact: true })).toHaveValue('Wasser'); // getippte Werte bleiben beim Umschalten
    const naechste = d.getByLabel('Nächste Zahlung im', { exact: true });
    await expect(naechste.locator('option')).toHaveText(['Oktober 2026', 'November 2026']);
    await naechste.selectOption({ label: 'November 2026' });
    await d.getByLabel('Kategorie', { exact: true }).selectOption({ label: '🏠 Wohnen & Energie' });
    await d.getByRole('button', { name: 'Speichern' }).click();
    await expect(d).toBeHidden();

    const wasser = zeile(page, 'Wohnen & Energie', 'Wasser');
    await expect(wasser.locator('.fk-n small')).toHaveText('GEM alle 2 Monate 120 € · am 1.');
    await expect(wasser.locator('.fk-b')).toHaveText('60 €pro Monat');
    await expect(gross(page)).toHaveText('1.519,39 €');
    await expect(karte(page, 'Diesen Monat fällig').locator('.fk-n > b', { hasText: 'Wasser' })).toHaveCount(0); // erst im November
  });

  test('Vertrag mit monatlicher Verlängerung: „monatlich kündbar“, keine Erinnerung, nie ⚠', async ({ page }) => {
    await oeffneFixkosten(page);
    await page.getByRole('button', { name: '＋ Fixkosten eintragen' }).click();
    const d = dialog(page, 'Neue Fixkosten');
    await d.getByRole('button', { name: '📱 Handy' }).click();
    await expect(d.getByLabel('Verlängert sich um', { exact: true })).toHaveValue('1');
    await d.getByLabel('Betrag in Euro').fill('12');
    await d.getByLabel('Vertrag läuft bis', { exact: true }).fill('31.03.2025');
    await expect(d.locator('.fk-vorschau')).toHaveText('→ Kündbar bis 30.10.2026, danach monatlich kündbar – keine Erinnerung nötig.');
    await d.getByRole('button', { name: 'Speichern' }).click();
    await expect(d).toBeHidden();
    const handy = zeile(page, 'Kommunikation', 'Handy');
    await expect(handy.locator('.fk-abzeichen')).toHaveText('📝 monatlich kündbar');
    await expect(handy.locator('.fk-abzeichen')).not.toHaveClass(/warn/);
    await expect(karte(page, 'Kündigungsfristen').locator('.fk-n > b')).toHaveText(['Kfz-Versicherung Papa', 'Fitnessstudio', 'Handy']);
  });

  test('Archivieren (mit Datum): ins Archiv, raus aus den Summen; zurückholen; „Endgültig löschen“ nur mit Rückfrage; bleibt nach dem Neuladen', async ({ page }) => {
    await oeffneFixkosten(page);
    await zeile(page, 'Freizeit & Abos', 'Streaming').click();
    const d = dialog(page, 'Fixkosten ändern');
    await d.getByRole('button', { name: '🗄️ Archivieren' }).click();
    const archivieren = dialog(page, '„Streaming“ archivieren');
    await expect(archivieren.getByLabel('Archivieren ab', { exact: true })).toHaveValue('14.10.2026');
    await archivieren.getByRole('button', { name: 'Archivieren', exact: true }).click();
    await erwarteToast(page, 'Archiviert ✓');
    await expect(archivieren).toBeHidden();
    await expect(d).toBeHidden();

    await expect(gross(page)).toHaveText('1.445,40 €');
    await expect(kopf(page).locator('.fk-kopf-zeile').first()).toHaveText('Diesen Monat fällig1.531,70 €');
    await expect(zeile(page, 'Freizeit & Abos', 'Streaming')).toHaveCount(0);
    const archiv = karte(page, 'Archiv');
    await expect(archiv.locator('.fk-n > b')).toHaveText(['Streaming', 'Babyschwimmen']);

    await page.reload();
    await expect(karte(page, 'Archiv').locator('.fk-n > b')).toHaveText(['Streaming', 'Babyschwimmen']);

    // zurückholen
    await karte(page, 'Archiv').locator('.fk-pos', { hasText: 'Streaming' }).click();
    await dialog(page, 'Streaming').getByRole('button', { name: 'Zurückholen' }).click();
    await erwarteToast(page, 'Zurückgeholt ✓');
    await expect(gross(page)).toHaveText('1.459,39 €');
    await expect(zeile(page, 'Freizeit & Abos', 'Streaming')).toHaveCount(1);

    // endgültig löschen: erst nach der Rückfrage
    await karte(page, 'Archiv').locator('.fk-pos', { hasText: 'Babyschwimmen' }).click();
    await dialog(page, 'Babyschwimmen').getByRole('button', { name: 'Endgültig löschen' }).click();
    const frage = dialog(page, 'Endgültig löschen?');
    await expect(frage).toContainText('„Babyschwimmen“ wird endgültig gelöscht');
    await frage.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(karte(page, 'Archiv')).toHaveCount(1);
    await dialog(page, 'Babyschwimmen').getByRole('button', { name: 'Endgültig löschen' }).click();
    await dialog(page, 'Endgültig löschen?').getByRole('button', { name: 'Endgültig löschen' }).click();
    await erwarteToast(page, 'Gelöscht ✓');
    await expect(karte(page, 'Archiv')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Fixkosten 💶' })).toBeVisible();
    await expect(karte(page, 'Archiv')).toHaveCount(0);
  });

  test('Ziel der Erinnerungen: #/konto/fixkosten öffnet die Fixkosten, #/konto/kontostand den Kontostand (Adresse wird #/konto)', async ({ page }) => {
    await starteDemo(page, { route: '#/konto/fixkosten' });
    await expect(page.getByRole('heading', { name: 'Fixkosten 💶' })).toBeVisible();
    await expect(page).toHaveURL(/#\/konto$/);
    await expect(page.locator('nav.tabs .tab.aktiv')).toContainText('Konto');
    await page.evaluate(() => {
      location.hash = '#/konto/kontostand';
    });
    await expect(page.getByRole('heading', { name: 'Kontostand 💶' })).toBeVisible();
    await expect(page).toHaveURL(/#\/konto$/);
    await page.evaluate(() => {
      location.hash = '#/konto/fixkosten';
    });
    await expect(page.getByRole('heading', { name: 'Fixkosten 💶' })).toBeVisible();
  });

  test('„Kontostand eintragen“ auf Heute öffnet den Kontostand, auch wenn zuletzt Fixkosten gewählt waren', async ({ page }) => {
    await starteDemo(page, { zeit: '2026-09-30T19:00:00+02:00', speicher: { 'fk.konto.ansicht.v1': 'fixkosten' } });
    await page.getByRole('button', { name: 'Kontostand eintragen' }).click();
    await expect(page.getByRole('heading', { name: 'Kontostand 💶' })).toBeVisible();
  });

  test('Demo: „Beispieldaten entfernen“ leert auch die Fixkosten', async ({ page }) => {
    await starteDemo(page, { route: '#/konto' });
    await page.getByRole('button', { name: 'Beispieldaten entfernen' }).click();
    const frage = dialog(page, 'Beispieldaten entfernen?');
    await expect(frage).toContainText('Sonderbeträge und Fixkosten');
    await frage.getByRole('button', { name: 'Entfernen' }).click();
    await erwarteToast(page, 'Beispieldaten entfernt');
    await page.getByRole('group', { name: 'Ansicht im Konto' }).getByRole('button', { name: 'Fixkosten' }).click();
    await expect(gross(page)).toHaveText('0 €');
    await expect(page.getByText('Noch keine Fixkosten.')).toBeVisible();
    await expect(page.locator('.fk-kategorie')).toHaveCount(0);
    await expect(karte(page, 'Archiv')).toHaveCount(0);
    await page.reload();
    await expect(gross(page)).toHaveText('0 €');
  });

  test('Demo: unlesbarer Teil mit klarer Meldung; Posten einer neueren Version ausgeblendet mit Hinweis', async ({ page }) => {
    await oeffneFixkosten(page);
    await expect(page.locator('.fk-fremd')).toHaveCount(0);
    await expect(page.locator('.fk-meldung')).toHaveCount(0);
    await page.evaluate(() => {
      const daten = JSON.parse(localStorage.getItem('fk.demo.v1'));
      daten.fixkosten.shards[0] = { ...(daten.fixkosten.shards[0] ?? { v: 1, posten: [] }), fremd: [{ i: 'neu00001', n: 'Neu', z: 1 }, { i: 'neu00002', n: 'Neu 2', z: 1 }] };
      daten.fixkosten.shards[3] = 'kein Teil';
      localStorage.setItem('fk.demo.v1', JSON.stringify(daten));
    });
    await page.reload();
    const meldung = page.locator('.fk-meldung.warn');
    await expect(meldung).toHaveCount(1);
    await expect(meldung).toContainText('Teil 4 von 4 der Fixkosten ist unlesbar');
    await expect(meldung).toContainText(TEXT_TEIL_GESPERRT);
    await expect(page.locator('.fk-fremd')).toHaveText('ℹ️ 2 Posten von einer neueren App-Version ausgeblendet – bitte App aktualisieren');
    await expect(page.locator('.fk-meldung:not(.warn)')).toHaveCount(0); // die gleichbedeutende Warnung steht nicht doppelt da
  });
});

test.describe('Fixkosten mit Google', () => {
  test.use({ erlaubteFehler: NETZFEHLER }); // fehlende versteckte Ereignisse antworten 404

  test('Warnungen beim Lesen, unlesbarer Teil und ausgeblendeter Posten; Lesen beim Öffnen', async ({ page }) => {
    const teil0 = JSON.stringify({
      v: 1,
      p: [
        { i: 'aaaa0001', n: 'Miete', c: 90000, m: 1, d: '1', s: '2026-01', k: 'wohnen', w: 'gemeinsam', t: 5 },
        { i: 'aaaa0002', n: 'Neu', c: 100, m: 1, d: '1', s: '2026-01', k: 'wohnen', w: 'gemeinsam', z: 'neu' },
      ],
    });
    const ereignis = (nr, description) => ({ id: `fkfest${nr}`, summary: '💶 fk Fixkosten (nicht löschen)', description, start: { date: '2000-01-01' }, end: { date: '2000-01-02' }, transparency: 'transparent' });
    const google = await starteGoogleVerbunden(page, { route: '#/konto', ereignisse: [ereignis(0, teil0), ereignis(2, '{"v":1,"p":[{"i":"kap')], speicher: { 'fk.konto.ansicht.v1': 'fixkosten' } });
    await expect(page.getByRole('heading', { name: 'Fixkosten 💶' })).toBeVisible();
    await expect(gross(page)).toHaveText('900 €');
    await expect(page.locator('.fk-meldung.warn')).toContainText('Teil 3 von 4 der Fixkosten ist unlesbar');
    await expect(page.locator('.fk-meldung:not(.warn)')).toHaveText('⚠️ Die Notiz bei „Miete“ war unlesbar und wurde entfernt.');
    await expect(page.locator('.fk-fremd')).toHaveText('ℹ️ 1 Posten von einer neueren App-Version ausgeblendet – bitte App aktualisieren');
    expect(google.anfragen.filter((a) => a.startsWith('GET ') && a.includes('/events/fkfest')).length).toBeGreaterThanOrEqual(4);
  });
});
