// Autos (1.3.0) in der Demo, in allen drei Aussehen: Mehr → Autos → Auto, Fällig mit Stand, Ölwechsel eintragen verschiebt den
// Termin, Tesla-Reifenwechsel mit Vorschlag „vorne/hinten getauscht“, Vignette, Kilometerstand ändert die Schätzung (und bleibt nach
// dem Neuladen), Karte auf Heute führt zum Auto (auch „+ N weitere“), Löschen mit „Rückgängig“ (Arbeit und Auto), Auto aus Vorlage,
// Wischen im Verlauf; in Glas und Bento alle Ziele ≥ 44 px.
import { test, expect, starteDemo, erwarteToast, WERKTAG_DATUM } from './hilfen.js';
import { autoId, demoMitAutos, teslaOhneReifensaetze, vierFaellig, winterRotationFaellig } from './autos-hilfen.js';

const TESLA = autoId(WERKTAG_DATUM, 'Tesla Model 3');
const FIAT = autoId(WERKTAG_DATUM, 'Fiat 500');
const abschnitt = (page, titel) => page.locator('section.abschnitt').filter({ has: page.getByRole('heading', { name: titel, exact: true }) });
const regel = (page, typ) => page.locator(`.au-regel[data-typ="${typ}"]`);
const blatt = (page, titel) => page.getByRole('dialog', { name: titel });

test('Mehr → Autos → Auto: Zeile mit „N fällig“, Karten je Auto, Seite des Autos', async ({ page }) => {
  await starteDemo(page, { route: '#/mehr', zeit: '2026-10-20T08:00:00+02:00' });
  const zeile = page.locator('.menue-eintrag[data-id="autos"] .menue-zeile');
  await expect(zeile).toContainText('Autos');
  await expect(zeile.locator('.menue-marke')).toHaveText('1 fällig'); // M7: der Fiat (Reifensatz unbekannt) zählt nicht
  await zeile.click();
  await expect(page).toHaveURL(/#\/autos$/);
  await expect(page).toHaveTitle('Familienkalender · Autos');
  const karten = page.locator('.au-karte');
  await expect(karten).toHaveCount(2);
  await expect(karten.locator('h3')).toHaveText(['Tesla Model 3', 'Fiat 500']);
  await expect(karten.nth(0).locator('.au-kennzeichen')).toHaveText('W-12345');
  await expect(karten.nth(0).locator('.au-km-zahl')).toHaveText(/^ca\. \d{1,3}\.\d{3} km$/);
  await expect(karten.nth(0).locator('.au-naechste')).toContainText('Reifenwechsel (saisonal)');
  await expect(karten.nth(0).locator('.au-status')).toHaveText('⏳ bald');
  await expect(karten.nth(0).locator('.au-faellig')).toHaveText('1 fällig');
  await karten.nth(0).click();
  await expect(page).toHaveURL(new RegExp(`#/autos/${autoId('2026-10-20', 'Tesla Model 3')}$`));
  await expect(page.locator('h1.au-titel')).toHaveText('Tesla Model 3');
  for (const titel of ['Fällig', 'Kilometerstand', 'Reifen', 'Vignette', 'Verlauf', 'Fahrzeugdaten']) await expect(abschnitt(page, titel)).toBeVisible();
  await expect(abschnitt(page, 'Fahrzeugdaten')).toContainText('versteckt in eurem eigenen Google-Kalender, als Offline-Kopie auf diesem Telefon');
  await page.getByRole('button', { name: '‹ Autos' }).click();
  await expect(page).toHaveURL(/#\/autos$/);
});

test('Marke „N fällig“ in Mehr: ändert sich an Ort und Stelle, wenn eine Arbeit das Fällige erledigt (ohne Neuzeichnen der Seite)', async ({ page }) => {
  const zeit = '2026-10-20T08:00:00+02:00';
  const tesla = autoId('2026-10-20', 'Tesla Model 3');
  await starteDemo(page, { route: `#/autos/${tesla}`, zeit, speicher: { 'fk.demo.v1': demoMitAutos('2026-10-20', vierFaellig) } });
  // das Blatt „Reifenwechsel eintragen“ bleibt offen, darunter geht es zurück nach „Mehr“
  await page.getByRole('button', { name: 'Reifenwechsel (saisonal): Reifenwechsel eintragen' }).click();
  const b = blatt(page, '🛞 Reifenwechsel eintragen');
  await expect(b.getByRole('button', { name: '❄️ Winter' })).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => (location.hash = '#/mehr'));
  const zeile = page.locator('.menue-eintrag[data-id="autos"] .menue-zeile');
  const marke = zeile.locator('.menue-marke');
  await expect(marke).toHaveText('4 fällig');
  // Merker an der Seite und an der Marke: ein Neuzeichnen von „Mehr“ würde beide ersetzen
  await page.evaluate(() => {
    document.querySelector('#inhalt').firstElementChild.dataset.testMerker = 'mehr';
    document.querySelector('.menue-eintrag[data-id="autos"] .menue-marke').dataset.testMerker = 'marke';
  });
  await b.getByRole('button', { name: 'Eintragen' }).click();
  await erwarteToast(page, 'Eingetragen ✓');
  await expect(marke).toHaveText('3 fällig');
  await expect(page).toHaveURL(/#\/mehr$/);
  await expect(page.locator('#inhalt > [data-test-merker="mehr"]')).toHaveCount(1);
  await expect(marke).toHaveAttribute('data-test-merker', 'marke');
});

test('Fällig: ✓ ok, ? unbekannt mit „Letzte Erledigung eintragen“, ⚠ überfällig und ⏳ bald; Regel mit Info und Quelle', async ({ page }) => {
  await starteDemo(page, { route: `#/autos/${FIAT}` });
  await expect(regel(page, 'oelwechsel').locator('.au-status')).toHaveText('✓ ok');
  await expect(regel(page, 'oelwechsel').locator('.au-regel-text')).toHaveText('fällig am 07.05.2027 (in ca. 7 Monaten)');
  await expect(regel(page, 'zuendkerzen').locator('.au-status')).toHaveText('? unbekannt');
  await expect(regel(page, 'zuendkerzen').locator('.au-regel-text')).toHaveText('unbekannt – Letzte Erledigung eintragen');
  await expect(regel(page, 'zuendkerzen').getByRole('button', { name: 'Zündkerzen: Letzte Erledigung eintragen' })).toBeVisible();
  await page.getByRole('button', { name: 'Ölwechsel: Info, Quelle, ändern oder abschalten' }).click();
  const b = blatt(page, '🛢️ Ölwechsel');
  await expect(b.locator('.au-regel-info')).toContainText('SAE 0W-30');
  await expect(b.getByRole('link', { name: /^Quelle: aftersales\.fiat\.com/ })).toHaveAttribute('target', '_blank');
  // abschalten: die Regel verschwindet aus „Fällig“ und steht unter „Abgeschaltet“; wieder einschalten
  await b.getByRole('checkbox', { name: /Aktiv/ }).uncheck();
  await b.getByRole('button', { name: 'Speichern' }).click();
  await erwarteToast(page, 'Abgeschaltet ✓');
  await expect(regel(page, 'oelwechsel')).toHaveCount(0);
  await page.locator('.au-aus-zeile').filter({ hasText: 'Ölwechsel' }).getByRole('button', { name: 'Einschalten' }).click();
  await erwarteToast(page, 'Eingeschaltet ✓');
  await expect(regel(page, 'oelwechsel')).toHaveCount(1);
});

test('Fällig am 20.12.: ⚠ überfällig (Winterreifen) und ⏳ bald (Vignette)', async ({ page }) => {
  await starteDemo(page, { zeit: '2026-12-20T08:00:00+01:00', route: `#/autos/${autoId('2026-12-20', 'Tesla Model 3')}` });
  await expect(regel(page, 'reifenwechsel').locator('.au-status')).toHaveText('⚠ überfällig');
  await expect(regel(page, 'reifenwechsel').locator('.au-regel-text')).toHaveText('Winterreifen montieren – überfällig seit 01.11.2026');
  await expect(regel(page, 'vignette').locator('.au-status')).toHaveText('⏳ bald');
  await expect(page.locator('.au-held .au-faellig')).toHaveText('2 fällig');
});

test('Ölwechsel eintragen: Vorschläge aus der Vorlage, der Termin rückt ein Jahr weiter, Eintrag oben im Verlauf', async ({ page }) => {
  await starteDemo(page, { route: `#/autos/${FIAT}` });
  await page.getByRole('button', { name: 'Ölwechsel: Erledigt eintragen' }).click();
  const b = blatt(page, '🛢️ Ölwechsel eintragen');
  await expect(b.getByRole('textbox', { name: 'Kilometerstand' })).toHaveValue('99.975');
  await expect(b).toContainText('Geschätzt – bitte vom Tacho ablesen');
  await expect(b.getByRole('textbox', { name: 'Ölsorte' })).toHaveAttribute('placeholder', 'z. B. SAE 0W-30, ACEA C2');
  await expect(b.getByRole('textbox', { name: 'Menge in Litern' })).toHaveAttribute('placeholder', 'z. B. 3,2');
  await expect(b.getByRole('checkbox', { name: 'Ölfilter gewechselt' })).toBeChecked();
  await b.getByRole('textbox', { name: 'Kilometerstand' }).fill('100.020');
  await expect(b).not.toContainText('Geschätzt – bitte vom Tacho ablesen');
  await b.getByRole('textbox', { name: 'Ölsorte' }).fill('SAE 0W-30');
  await b.getByRole('textbox', { name: 'Menge in Litern' }).fill('3,2');
  await b.getByRole('textbox', { name: 'Kosten in Euro' }).fill('139,90');
  // eine falsche Menge: verständliche Meldung, das Blatt bleibt offen; berichtigt ersetzt „Eingetragen ✓“ die Fehlermeldung
  await b.getByRole('textbox', { name: 'Menge in Litern' }).fill('drei');
  await b.getByRole('button', { name: 'Eintragen' }).click();
  await erwarteToast(page, 'Bitte die Menge in Litern eingeben, z. B. 3,2.');
  await b.getByRole('textbox', { name: 'Menge in Litern' }).fill('3,2');
  await b.getByRole('button', { name: 'Eintragen' }).click();
  await erwarteToast(page, 'Eingetragen ✓');
  await expect(b).toHaveCount(0);
  await expect(regel(page, 'oelwechsel').locator('.au-regel-text')).toHaveText('fällig am 14.10.2027 (in ca. 12 Monaten)');
  const neu = abschnitt(page, 'Verlauf').locator('.au-eintrag').first();
  await expect(neu.locator('b')).toHaveText('Ölwechsel');
  await expect(neu).toContainText('14.10.2026 · 100.020 km');
  await expect(neu).toContainText('SAE 0W-30 · 3,2 l · mit Filter');
  await expect(neu.locator('.au-kosten')).toHaveText('139,90 €');
});

test('Tesla-Reifenwechsel ohne erreichtes Intervall: der eingelagerte Satz ist gewählt, kein Vorschlag', async ({ page }) => {
  // ohne erreichtes Intervall: kein Vorschlag
  await starteDemo(page, { route: `#/autos/${TESLA}` });
  await abschnitt(page, 'Reifen').getByRole('button', { name: '＋ Reifenwechsel' }).click();
  const b = blatt(page, '🛞 Reifenwechsel eintragen');
  await expect(b.getByRole('button', { name: '❄️ Winter' })).toHaveAttribute('aria-pressed', 'true');
  await expect(b.getByRole('checkbox', { name: 'Vorne/hinten getauscht (rotiert)' })).not.toBeChecked();
  await expect(b.locator('.au-vorschlag')).toHaveCount(0);
});

test('Tesla-Reifenwechsel mit Vorschlag: Winter hat 10.600 km seit dem Rotieren → „vorne/hinten getauscht“ an, beim Speichern zurück auf 0', async ({ page }) => {
  await starteDemo(page, { route: `#/autos/${TESLA}`, speicher: { 'fk.demo.v1': demoMitAutos(WERKTAG_DATUM, winterRotationFaellig) } });
  await expect(page.locator('.au-satz').filter({ hasText: 'Winter' })).toContainText('10.600 / 10.000 km');
  await expect(page.locator('.au-satz').filter({ hasText: 'Winter' }).locator('.au-warnung')).toContainText('Rotieren fällig');
  await abschnitt(page, 'Reifen').getByRole('button', { name: '＋ Reifenwechsel' }).click();
  const b = blatt(page, '🛞 Reifenwechsel eintragen');
  const haken = b.getByRole('checkbox', { name: 'Vorne/hinten getauscht (rotiert)' });
  await expect(haken).toBeChecked();
  await expect(b.locator('.au-vorschlag')).toContainText('„Winter“ ist seit dem letzten Rotieren 10.600 km gefahren');
  await b.getByRole('button', { name: '☀️ Sommer' }).click();
  await expect(haken).not.toBeChecked();
  await b.getByRole('button', { name: '❄️ Winter' }).click();
  await expect(haken).toBeChecked();
  await b.getByRole('textbox', { name: 'Kilometerstand' }).fill('18.900');
  await b.getByRole('button', { name: 'Eintragen' }).click();
  await erwarteToast(page, 'Eingetragen ✓');
  const winter = page.locator('.au-satz').filter({ hasText: 'Winter' });
  await expect(winter.locator('.au-marke')).toHaveText('montiert seit 14.10.2026');
  await expect(winter).toContainText('0 / 10.000 km');
  await expect(page.locator('.au-satz').filter({ hasText: 'Sommer' }).locator('.au-marke')).toHaveText('eingelagert');
  await expect(page.locator('.au-radmuttern')).toContainText('Radmuttern nach ca. 50–100 km nachziehen (175 Nm)');
});

test('Vignette eintragen: Jahr, digital oder Klebe, gekauft am, Hinweis auf den 18. Tag; danach gilt das nächste Jahr', async ({ page }) => {
  await starteDemo(page, { route: `#/autos/${TESLA}` });
  const vignette = abschnitt(page, 'Vignette');
  await expect(vignette.locator('.au-regel-name')).toHaveText('Vignette 2027');
  await expect(vignette.locator('.au-info li')).toHaveCount(3);
  await expect(vignette.getByRole('link', { name: 'Quelle: ASFINAG ↗' })).toBeVisible();
  await vignette.getByRole('button', { name: 'Vignette eintragen' }).click();
  const b = blatt(page, '🎫 Vignette eintragen');
  await expect(b.getByRole('combobox', { name: 'Jahr der Vignette' })).toHaveValue('2027');
  await expect(b.getByRole('button', { name: '📱 digital' })).toHaveAttribute('aria-pressed', 'true');
  await expect(b).toContainText('erst ab dem 18. Tag');
  await expect(b.getByRole('textbox', { name: 'Kilometerstand' })).toHaveCount(0);
  await b.getByRole('button', { name: '🏷️ Klebe' }).click();
  await b.getByRole('button', { name: 'Eintragen' }).click();
  await erwarteToast(page, 'Eingetragen ✓');
  await expect(vignette.locator('.au-regel-name')).toHaveText('Vignette 2028');
  await expect(abschnitt(page, 'Verlauf').locator('.au-eintrag').first()).toContainText('Jahr 2027 · Klebe');
});

test('Kilometerstand aktualisieren: „bitte prüfen“ gleich beim Tippen, neue Schätzung, bleibt nach dem Neuladen', async ({ page }) => {
  await starteDemo(page, { route: `#/autos/${TESLA}` });
  const km = abschnitt(page, 'Kilometerstand');
  await expect(km.locator('.au-km-zahl')).toHaveText('ca. 18.872 km');
  await expect(regel(page, 'rotation').locator('.au-regel-text')).toHaveText('bei ca. 21.800 km');
  await km.getByRole('button', { name: 'Kilometerstand aktualisieren' }).click();
  const b = blatt(page, 'Kilometerstand aktualisieren');
  const feld = b.getByRole('textbox', { name: 'Kilometerstand laut Tacho' });
  await feld.fill('17.000');
  await expect(b.locator('.au-feld-hinweis')).toContainText('Bitte prüfen');
  await feld.fill('19.500');
  await expect(b.locator('.au-feld-hinweis')).toHaveCount(0);
  await b.getByRole('button', { name: 'Speichern' }).click();
  await erwarteToast(page, 'Kilometerstand gespeichert ✓');
  await expect(km.locator('.au-km-zahl')).toHaveText('19.500 km');
  await expect(page.locator('.au-held .au-km-zahl')).toHaveText('19.500 km');
  await expect(km).toContainText('Zuletzt bekannt: 19.500 km am 14.10.2026');
  await expect(regel(page, 'rotation').locator('.au-regel-text')).not.toHaveText('bei ca. 21.800 km');
  await page.reload();
  await expect(abschnitt(page, 'Kilometerstand').locator('.au-km-zahl')).toHaveText('19.500 km');
});

test('Karte „🚗 Auto“ auf Heute: eine Zeile führt zum Auto, „+ N weitere“ zur Liste', async ({ page }) => {
  await starteDemo(page, { zeit: '2026-10-20T08:00:00+02:00' });
  const karte = page.locator('section.abschnitt').filter({ has: page.getByRole('heading', { name: '🚗 Auto', exact: true }) });
  await karte.locator('a.zeile').filter({ hasText: 'Tesla Model 3' }).click();
  await expect(page).toHaveURL(new RegExp(`#/autos/${autoId('2026-10-20', 'Tesla Model 3')}$`));
  await expect(page.locator('h1.au-titel')).toHaveText('Tesla Model 3');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('Karte „🚗 Auto“ mit vier fälligen Dingen: drei Zeilen und „+ 1 weitere“ zur Liste', async ({ page }) => {
  await starteDemo(page, { zeit: '2026-10-20T08:00:00+02:00', speicher: { 'fk.demo.v1': demoMitAutos('2026-10-20', vierFaellig) } });
  const karte = page.locator('section.abschnitt').filter({ has: page.getByRole('heading', { name: '🚗 Auto', exact: true }) });
  await expect(karte.locator('a.zeile')).toHaveCount(3);
  const weitere = karte.getByRole('link', { name: '+ 1 weitere' });
  await expect(weitere).toBeVisible();
  await weitere.click();
  await expect(page).toHaveURL(/#\/autos$/);
  await expect(page.locator('.au-karte')).toHaveCount(2);
});

test('Löschen mit „Rückgängig“: eine Arbeit (Blatt und Wischen) und das ganze Auto', async ({ page }) => {
  await starteDemo(page, { route: `#/autos/${FIAT}` });
  const eintraege = abschnitt(page, 'Verlauf').locator('.au-eintrag');
  await expect(eintraege).toHaveCount(3);
  await eintraege.first().click();
  const b = blatt(page, '🛢️ Ölwechsel ändern');
  await expect(b.getByRole('textbox', { name: 'Kilometerstand' })).toHaveValue('96.500');
  await b.getByRole('button', { name: 'Löschen' }).click();
  await erwarteToast(page, 'Gelöscht ✓');
  await expect(eintraege).toHaveCount(2);
  await expect(regel(page, 'oelwechsel').locator('.au-status')).toHaveText('? unbekannt');
  await page.locator('.toast').getByRole('button', { name: 'Rückgängig' }).click();
  await erwarteToast(page, 'Wiederhergestellt ✓');
  await expect(eintraege).toHaveCount(3);
  await expect(regel(page, 'oelwechsel').locator('.au-status')).toHaveText('✓ ok');

  // nach links wischen gibt „Löschen“ frei
  const huelle = abschnitt(page, 'Verlauf').locator('.au-wisch').first();
  // (WebKit am Rechner kennt keinen Touch-Konstruktor: dort über das Blatt)
  const gewischt = await eintraege.first().evaluate((el) => {
    let punkt;
    try {
      const r = el.getBoundingClientRect();
      punkt = (x) => new Touch({ identifier: 1, target: el, clientX: x, clientY: r.top + 20 });
      punkt(0);
    } catch {
      return false;
    }
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new TouchEvent('touchstart', { touches: [punkt(r.right - 20)], bubbles: true }));
    el.dispatchEvent(new TouchEvent('touchmove', { touches: [punkt(r.right - 140)], bubbles: true }));
    el.dispatchEvent(new TouchEvent('touchend', { touches: [], bubbles: true }));
    return true;
  });
  if (gewischt) {
    await expect(huelle).toHaveClass(/offen/);
    await huelle.locator('.au-wisch-loeschen').click();
  } else {
    await eintraege.first().click();
    await blatt(page, '🛢️ Ölwechsel ändern').getByRole('button', { name: 'Löschen' }).click();
  }
  await erwarteToast(page, 'Gelöscht ✓');
  await expect(eintraege).toHaveCount(2);

  // das ganze Auto
  await page.getByRole('button', { name: 'Fahrzeugdaten bearbeiten' }).click();
  await blatt(page, 'Fahrzeugdaten bearbeiten').getByRole('button', { name: 'Auto löschen' }).click();
  await blatt(page, 'Auto löschen?').getByRole('button', { name: 'Löschen' }).click();
  await erwarteToast(page, 'Gelöscht ✓');
  await expect(page).toHaveURL(/#\/autos$/);
  await expect(page.locator('.au-karte')).toHaveCount(1);
  await page.locator('.toast').getByRole('button', { name: 'Rückgängig' }).click();
  await erwarteToast(page, 'Wiederhergestellt ✓');
  await expect(page.locator('.au-karte h3')).toHaveText(['Tesla Model 3', 'Fiat 500']);
  await page.reload();
  await expect(page.locator('.au-karte')).toHaveCount(2);
});

test.describe('M2 (Abschluss-Review): löschen mit „Rückgängig“ – Kilometerstand, Regel, Reifensatz', () => {
  test('Kilometerstand: „Alle Stände“ → Löschen → Rückgängig; bleibt nach dem Neuladen', async ({ page }) => {
    await starteDemo(page, { route: `#/autos/${TESLA}` });
    const km = abschnitt(page, 'Kilometerstand');
    await expect(km.locator('.au-km-zahl')).toHaveText('ca. 18.872 km');
    await km.getByText('Alle Stände (1)').click();
    const eintrag = km.locator('.au-km-eintrag');
    await expect(eintrag).toHaveCount(1);
    await expect(eintrag).toContainText('02.10.2026 · 18.400 km');
    await eintrag.getByRole('button', { name: 'Löschen: Kilometerstand vom 02.10.2026 (18.400 km)' }).click();
    await erwarteToast(page, 'Gelöscht ✓');
    await expect(km.locator('.au-km-alle')).toHaveCount(0);
    await expect(km).not.toContainText('Zuletzt bekannt: 18.400 km');
    await page.locator('.toast').getByRole('button', { name: 'Rückgängig' }).click();
    await erwarteToast(page, 'Wiederhergestellt ✓');
    await expect(km.locator('.au-km-zahl')).toHaveText('ca. 18.872 km');
    await expect(km.locator('.au-km-alle')).toHaveAttribute('open', '');
    await eintrag.getByRole('button', { name: /^Löschen: Kilometerstand vom 02\.10\.2026/ }).click();
    await erwarteToast(page, 'Gelöscht ✓');
    await page.reload();
    await expect(abschnitt(page, 'Kilometerstand')).not.toContainText('18.400 km');
    await expect(abschnitt(page, 'Kilometerstand').locator('.au-km-alle')).toHaveCount(0);
  });

  test('Regel löschen → Rückgängig; danach weg aus „Fällig“, aus der Marke in Mehr und von der Karte auf Heute', async ({ page }) => {
    const zeit = '2026-10-20T08:00:00+02:00';
    const tesla = autoId('2026-10-20', 'Tesla Model 3');
    await starteDemo(page, { route: `#/autos/${tesla}`, zeit });
    await expect(regel(page, 'reifenwechsel')).toHaveCount(1);
    const loeschen = async () => {
      await page.getByRole('button', { name: 'Reifenwechsel (saisonal): Info, Quelle, ändern oder abschalten' }).click();
      const b = blatt(page, '🛞 Reifenwechsel (saisonal)');
      await expect(b.getByRole('checkbox', { name: /Aktiv/ })).toBeChecked(); // Abschalten gibt es weiterhin
      await b.getByRole('button', { name: 'Regel löschen' }).click();
      await erwarteToast(page, 'Gelöscht ✓');
      await expect(b).toHaveCount(0);
      await expect(regel(page, 'reifenwechsel')).toHaveCount(0);
    };
    await loeschen();
    await page.locator('.toast').getByRole('button', { name: 'Rückgängig' }).click();
    await erwarteToast(page, 'Wiederhergestellt ✓');
    await expect(regel(page, 'reifenwechsel')).toHaveCount(1);
    await loeschen();
    await page.evaluate(() => (location.hash = '#/mehr'));
    await expect(page.locator('.menue-eintrag[data-id="autos"] .menue-zeile')).toContainText('Autos');
    await expect(page.locator('.menue-eintrag[data-id="autos"] .menue-marke')).toBeHidden(); // 0 fällig: versteckt
    await page.evaluate(() => (location.hash = '#/heute'));
    await expect(page.locator('section.abschnitt').first()).toBeVisible();
    await expect(page.locator('section.abschnitt').filter({ has: page.getByRole('heading', { name: '🚗 Auto', exact: true }) })).toHaveCount(0);
    await page.goto(`/#/autos/${tesla}`);
    await expect(page.locator('h1.au-titel')).toHaveText('Tesla Model 3');
    await expect(regel(page, 'reifenwechsel')).toHaveCount(0);
  });

  test('Reifensatz löschen: im Verlauf genannt → klare Meldung, bleibt; unbenutzt → Gelöscht ✓ · Rückgängig', async ({ page }) => {
    await starteDemo(page, { route: `#/autos/${TESLA}` });
    const reifen = abschnitt(page, 'Reifen');
    await expect(reifen.locator('.au-satz')).toHaveCount(2);
    await reifen.getByRole('button', { name: 'Reifensatz löschen: Sommer' }).click();
    await erwarteToast(page, '„Sommer“ steht in 1 Arbeit im Verlauf und lässt sich deshalb nicht löschen. Erst diese Arbeiten im Verlauf löschen – dann geht es.');
    await expect(reifen.locator('.au-satz')).toHaveCount(2);
    await page.goto(`/#/autos/${FIAT}`);
    const fiatReifen = abschnitt(page, 'Reifen');
    await expect(fiatReifen.locator('.au-satz')).toHaveCount(2);
    await fiatReifen.getByRole('button', { name: 'Reifensatz löschen: Winter' }).click();
    await erwarteToast(page, 'Gelöscht ✓');
    await expect(fiatReifen.locator('.au-satz')).toHaveCount(1);
    await page.locator('.toast').getByRole('button', { name: 'Rückgängig' }).click();
    await erwarteToast(page, 'Wiederhergestellt ✓');
    await expect(fiatReifen.locator('.au-satz-kopf b')).toHaveText(['Sommer', 'Winter']);
    await page.reload();
    await expect(abschnitt(page, 'Reifen').locator('.au-satz')).toHaveCount(2);
  });
});

test('Noch kein Auto: Vorlage Tesla, Kennzeichen selbst eintragen, Regeln und Reifensätze sind gleich da', async ({ page }) => {
  await starteDemo(page, { route: '#/autos', speicher: { 'fk.demo.v1': demoMitAutos(WERKTAG_DATUM, undefined, { leer: true }) } });
  await expect(page.locator('.au-leer h3')).toHaveText('Noch kein Auto – ＋ Auto hinzufügen');
  await expect(page.locator('.au-leer .au-vorlage b')).toHaveText(['＋ Tesla Model 3', '＋ Fiat 500 TwinAir', '＋ Leer']);
  await page.locator('.au-leer .au-vorlage').first().click();
  const b = blatt(page, '＋ Auto hinzufügen');
  await expect(b.getByRole('button', { name: /^Tesla Model 3/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(b.getByRole('textbox', { name: 'Name' })).toHaveValue('Tesla Model 3');
  await expect(b).toContainText('versteckt in eurem eigenen Google-Kalender, als Offline-Kopie auf diesem Telefon');
  await b.getByRole('textbox', { name: 'Kennzeichen' }).fill('w-99999');
  await b.getByRole('button', { name: 'Auto anlegen' }).click();
  await erwarteToast(page, 'Auto angelegt ✓');
  await expect(page).toHaveURL(/#\/autos\/[0-9a-v]{8}$/);
  await expect(page.locator('h1.au-titel')).toHaveText('Tesla Model 3');
  await expect(page.locator('.au-held .au-kennzeichen')).toHaveText('W-99999');
  await expect(page.locator('.au-regel')).toHaveCount(8); // Leasing-Ende hat ohne Datum keinen Termin
  await expect(page.locator('.au-satz')).toHaveCount(2);
});

test('Leeres Auto ohne Reifensätze: „Reifensatz anlegen“ im Reifen-Abschnitt und im Reifenwechsel-Blatt – keine Sackgasse', async ({ page }) => {
  await starteDemo(page, { route: '#/autos', speicher: { 'fk.demo.v1': demoMitAutos(WERKTAG_DATUM, undefined, { leer: true }) } });
  await page.locator('.au-leer .au-vorlage').filter({ hasText: 'Leer' }).click();
  const neu = blatt(page, '＋ Auto hinzufügen');
  await neu.getByRole('textbox', { name: 'Name' }).fill('Kleinbus');
  await neu.getByRole('button', { name: 'Auto anlegen' }).click();
  await erwarteToast(page, 'Auto angelegt ✓');
  const reifen = abschnitt(page, 'Reifen');
  await expect(reifen).toContainText('Noch keine Reifensätze');
  await expect(reifen.getByRole('button', { name: '＋ Reifenwechsel' })).toHaveCount(0);
  // im Reifen-Abschnitt: Sommer
  await reifen.getByRole('button', { name: '＋ Reifensatz anlegen' }).click();
  let satz = blatt(page, '🛞 Reifensatz anlegen');
  await expect(satz.getByRole('button', { name: '☀️ Sommer' })).toHaveAttribute('aria-pressed', 'true');
  await expect(satz.getByRole('textbox', { name: 'Name des Reifensatzes' })).toHaveValue('Sommer');
  await satz.getByRole('button', { name: 'Anlegen' }).click();
  await erwarteToast(page, 'Reifensatz angelegt ✓');
  await expect(reifen.locator('.au-satz')).toHaveCount(1);
  // im Reifenwechsel-Blatt: Winter dazu, er ist danach (Oktober) gleich gewählt
  await page.locator('.au-held').getByRole('button', { name: '＋ Arbeit eintragen' }).click();
  const b = blatt(page, '＋ Arbeit eintragen');
  await b.getByRole('combobox', { name: 'Art der Arbeit' }).selectOption('reifenwechsel');
  await b.getByRole('button', { name: '＋ Reifensatz anlegen' }).click();
  satz = blatt(page, '🛞 Reifensatz anlegen');
  await expect(satz.getByRole('button', { name: '❄️ Winter' })).toHaveAttribute('aria-pressed', 'true');
  await satz.getByRole('textbox', { name: 'Reifengröße' }).fill('195/65 R15');
  await satz.getByRole('button', { name: 'Anlegen' }).click();
  await expect(b.getByRole('button', { name: '❄️ Winter' })).toHaveAttribute('aria-pressed', 'true');
  await b.getByRole('textbox', { name: 'Kilometerstand' }).fill('50.000');
  await b.getByRole('button', { name: 'Eintragen' }).click();
  await erwarteToast(page, 'Eingetragen ✓');
  await expect(reifen.locator('.au-satz').filter({ hasText: 'Winter' }).locator('.au-marke')).toHaveText('montiert seit 14.10.2026');
});

test('Auto ohne Reifensätze: „Reifen rotieren“ bietet „Reifensatz anlegen“, der neue Satz ist gleich gewählt – keine Sackgasse', async ({ page }) => {
  await starteDemo(page, { route: `#/autos/${TESLA}`, speicher: { 'fk.demo.v1': demoMitAutos(WERKTAG_DATUM, teslaOhneReifensaetze) } });
  await expect(abschnitt(page, 'Reifen')).toContainText('Noch keine Reifensätze');
  await regel(page, 'rotation').getByRole('button', { name: /^Reifen rotieren: (?!Info)/ }).click();
  const b = page.getByRole('dialog').filter({ hasText: 'Reifen rotiert' });
  await expect(b).toContainText('Dieses Auto hat noch keine Reifensätze – zuerst einen anlegen.');
  await b.getByRole('button', { name: '＋ Reifensatz anlegen' }).click();
  const satz = blatt(page, '🛞 Reifensatz anlegen');
  await expect(satz.getByRole('button', { name: '☀️ Sommer' })).toHaveAttribute('aria-pressed', 'true');
  await satz.getByRole('button', { name: 'Anlegen' }).click();
  await erwarteToast(page, 'Reifensatz angelegt ✓');
  await expect(satz).toHaveCount(0);
  await expect(b.getByRole('combobox', { name: 'Reifensatz' }).locator('option:checked')).toHaveText('Sommer');
  await expect(b).not.toContainText('noch keine Reifensätze');
  await b.getByRole('textbox', { name: 'Kilometerstand' }).fill('19.000');
  await b.getByRole('button', { name: 'Eintragen' }).click();
  await erwarteToast(page, 'Eingetragen ✓');
  await expect(abschnitt(page, 'Reifen').locator('.au-satz')).toHaveCount(1);
  await expect(abschnitt(page, 'Verlauf').getByRole('button', { name: /^Reifen rotieren, 14\.10\.2026 · 19\.000 km/ })).toContainText('Sommer rotiert');
});

test.describe('Glas und Bento', () => {
  test.beforeEach(({ aussehen }) => test.skip(!aussehen, 'nur in den Projekten telefon-glas und telefon-bento'));

  const kleineZiele = (page) =>
    page.evaluate(() =>
      // ein Kästchen zählt mit seinem <label> (wie tests/visuell/kontrast.mjs)
      [...document.querySelectorAll('#inhalt button, #inhalt a[href], #inhalt input, #inhalt select, .blatt button, .blatt input, .blatt select, .blatt a[href]')]
        .map((e) => (e.type === 'checkbox' && e.closest('label') ? e.closest('label') : e))
        .filter((e) => e.getClientRects().length > 0 && !e.classList.contains('picker-unsichtbar') && getComputedStyle(e).visibility !== 'hidden')
        .map((e) => ({ name: (e.getAttribute('aria-label') || e.textContent).trim().slice(0, 30), r: e.getBoundingClientRect() }))
        .filter(({ r }) => r.width < 44 || r.height < 44)
        .map(({ name, r }) => `${name} ${Math.round(r.width)}×${Math.round(r.height)}`),
    );

  test('alle Ziele ≥ 44 px auf der Liste, der Seite des Autos und im Blatt; Text ≥ 13 px', async ({ page }) => {
    await starteDemo(page, { route: '#/autos' });
    await expect(page.locator('.au-karte')).toHaveCount(2);
    expect(await kleineZiele(page)).toEqual([]);
    await page.goto(`/#/autos/${TESLA}`);
    await expect(page.locator('.au-held')).toBeVisible();
    expect(await kleineZiele(page)).toEqual([]);
    const klein = await page.evaluate(() =>
      [...document.querySelectorAll('#inhalt *')]
        .filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.data.trim()) && e.getClientRects().length > 0)
        .filter((e) => parseFloat(getComputedStyle(e).fontSize) < 13)
        .map((e) => `${e.className} ${getComputedStyle(e).fontSize}`),
    );
    expect(klein).toEqual([]);
    await page.getByRole('button', { name: 'Reifenwechsel (saisonal): Reifenwechsel eintragen' }).click();
    await expect(blatt(page, '🛞 Reifenwechsel eintragen')).toBeVisible();
    expect(await kleineZiele(page)).toEqual([]);
  });

  test('M2: die neuen Lösch-Knöpfe (Alle Stände, Reifensatz, Regel) sind ≥ 44 px', async ({ page }) => {
    await starteDemo(page, { route: `#/autos/${TESLA}` });
    const kopf = page.locator('.au-km-alle-kopf');
    expect((await kopf.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await kopf.click();
    await expect(page.locator('.au-km-eintrag')).toHaveCount(1);
    expect(await kleineZiele(page)).toEqual([]);
    await page.getByRole('button', { name: 'Reifenwechsel (saisonal): Info, Quelle, ändern oder abschalten' }).click();
    await expect(blatt(page, '🛞 Reifenwechsel (saisonal)').getByRole('button', { name: 'Regel löschen' })).toBeVisible();
    expect(await kleineZiele(page)).toEqual([]);
  });

  test('Balken „seit dem Rotieren“ wird über scaleX gefüllt, die Füllung ist voll breit', async ({ page }) => {
    await starteDemo(page, { route: `#/autos/${TESLA}` });
    const fuellung = page.locator('.au-satz').first().locator('.au-balken > span');
    await expect(fuellung).toHaveClass(/bw-fortschritt/);
    const breite = await fuellung.evaluate((el) => el.getBoundingClientRect().width / el.parentElement.getBoundingClientRect().width);
    expect(breite).toBeGreaterThan(0.6);
    expect(breite).toBeLessThan(0.8);
    expect(await fuellung.evaluate((el) => el.style.transform)).toMatch(/^scaleX\(0\.70/);
  });
});
