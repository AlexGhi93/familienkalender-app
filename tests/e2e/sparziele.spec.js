// „Sparziele“ im Konto-Tab (Demo, Mittwoch 14.10.2026, und Google-Attrappe): Umschalter mit drei Stellungen (gemerkt), Kopf mit den
// Werten der Domäne, Karten mit Status im aria-label, neues Ziel mit vorläufigem Datum und Bedarf live im Formular, Verschieben aus
// „Frei“, „Ziel beenden → Geld zurück zu Frei“, Verlauf pro Monat (Summe stimmt), Ausblenden, „Endgültig löschen“ mit Rückfrage, ohne
// Kontostand, unlesbar, Schreib- und Lesefehler (HTTP 500). Erwartete Zahlen kommen aus der Domäne (sparVerlauf mit den Demo-Daten)
// oder aus hier erfundenen Beispielen; die Demo-Ziele (src/app/seed.js) sind erfunden.
import { test, expect, starteDemo, starteGoogleVerbunden, erwarteToast, fehlerToastsZaehlen, NETZFEHLER, WERKTAG_DATUM } from './hilfen.js';
import { seedDemo } from '../../src/app/seed.js';
import { TEXT_ZIELE_GESPERRT, TEXT_ZIELE_NICHT_GELADEN, sparVerlauf, zielBeenden, zielLoeschen, zielSchluss } from '../../src/domain/sparziele.js';
import { betragText, deltaText } from '../../src/domain/konto.js';
import { kontoZuEreignis, zieleZuEreignis } from '../../src/calendar/mapping.js';

test.use({ viewport: { width: 375, height: 812 } });

const demo = seedDemo(WERKTAG_DATUM);
const v = sparVerlauf(demo.ziele, demo.konto, WERKTAG_DATUM);
const zielVon = (id) => v.ziele.find((z) => z.id === id);
const AUTO = zielVon('demo0001');
const URLAUB = zielVon('demo0002');

const umschalter = (page) => page.getByRole('group', { name: 'Ansicht im Konto' });
const kopf = (page) => page.locator('.sz-kopf');
const kopfWert = (page, text) => kopf(page).locator('.fk-kopf-zeile').filter({ hasText: text }).locator('b');
const karte = (page, name) => page.locator('.sz-ziel').filter({ has: page.locator('.sz-ziel-titel > span', { hasText: name }) });
const frei = (page) => page.locator('.sz-frei .sz-frei-betrag');
const dialog = (page, name) => page.getByRole('dialog', { name });

async function oeffneSparziele(page, optionen = {}) {
  await starteDemo(page, { route: '#/konto', ...optionen });
  await umschalter(page).getByRole('button', { name: 'Sparziele' }).click();
  await expect(page.getByRole('heading', { name: 'Sparziele 💶' })).toBeVisible();
}

test.describe('Sparziele im Konto-Tab (Demo)', () => {
  test('Umschalter mit drei Stellungen: gemerkt nach dem Neuladen; #/konto/sparziele; Kontostand und Fixkosten unverändert', async ({ page }) => {
    await starteDemo(page, { route: '#/konto' });
    await expect(umschalter(page).getByRole('button')).toHaveText(['Kontostand', 'Fixkosten', 'Sparziele']);
    await umschalter(page).getByRole('button', { name: 'Sparziele' }).click();
    await expect(page.getByRole('heading', { name: 'Sparziele 💶' })).toBeVisible();
    await expect(page).toHaveTitle('Familienkalender · Sparziele');
    expect(await page.evaluate(() => localStorage.getItem('fk.konto.ansicht.v1'))).toBe('sparziele');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Sparziele 💶' })).toBeVisible();
    await expect(umschalter(page).getByRole('button', { name: 'Sparziele' })).toHaveAttribute('aria-pressed', 'true');

    await umschalter(page).getByRole('button', { name: 'Fixkosten' }).click();
    await expect(page.getByRole('heading', { name: 'Fixkosten 💶' })).toBeVisible();
    await umschalter(page).getByRole('button', { name: 'Kontostand' }).click();
    await expect(page.locator('.konto-kachel-wert')).toHaveText(['+4.213,50 €', '+1.053,38 €', '3 von 4']);

    await page.evaluate(() => {
      location.hash = '#/konto/sparziele';
    });
    await expect(page.getByRole('heading', { name: 'Sparziele 💶' })).toBeVisible();
    await expect(page).toHaveURL(/#\/konto$/);
    await page.evaluate(() => {
      location.hash = '#/konto/fixkosten';
    });
    await expect(page.getByRole('heading', { name: 'Fixkosten 💶' })).toBeVisible();
  });

  test('Kopf mit den Werten der Domäne; Karten mit Balken, Status und aria-label; Knöpfe ≥ 44 px', async ({ page }) => {
    await oeffneSparziele(page);
    await expect(kopf(page).locator('.fk-gross')).toHaveText(betragText(v.summeZiele));
    await expect(kopfWert(page, 'Nötig pro Monat')).toHaveText(betragText(v.noetigGesamt));
    await expect(kopfWert(page, 'Frei verfügbar')).toHaveText(betragText(v.frei));
    await expect(kopf(page).locator('.sz-stand')).toHaveText('Stand: Kontostand September 2026 (beide)');
    await expect(page.locator('.sz-ziel .sz-ziel-titel > span')).toHaveText([`${AUTO.emoji} Auto`, `${URLAUB.emoji} Sommerurlaub`]);

    const auto = karte(page, 'Auto');
    await expect(auto.locator('.sz-ziel-titel small')).toHaveText('bis Juli 2028');
    await expect(auto.locator('.sz-stand-text')).toContainText(`${betragText(AUTO.gespart)} von ${betragText(AUTO.zielCents)}`);
    await expect(auto.locator('.sz-raster b')).toHaveText([betragText(AUTO.offen), `${betragText(AUTO.noetigProMonat)} / Monat`]);
    await expect(auto.locator('.sz-status')).toHaveText(`⚠ ${betragText(AUTO.plan.rueckstand)} hinter Plan`);
    await expect(auto).toHaveAttribute('aria-label', new RegExp(`⚠ ${betragText(AUTO.plan.rueckstand).replace('.', '\\.')} hinter Plan`));
    await expect(page.getByRole('article', { name: /^Sommerurlaub, bis ca\. Juli 2027 · vorläufig: .*hinter Plan$/ })).toBeVisible();
    await expect(page.getByRole('progressbar', { name: `Fortschritt ${AUTO.emoji} Auto` })).toBeVisible();
    await expect(frei(page)).toHaveText(betragText(v.frei));

    const hoehen = await page.locator('.screen.sparziele button:visible, .konto-segment button').evaluateAll((liste) => liste.map((b) => [b.textContent, b.getBoundingClientRect().height, b.getBoundingClientRect().width]));
    expect(hoehen.length).toBeGreaterThan(5);
    for (const [text, hoehe, breite] of hoehen) {
      expect(hoehe, text).toBeGreaterThanOrEqual(44);
      expect(breite, text).toBeGreaterThanOrEqual(44);
    }
  });

  test('neues Ziel mit vorläufigem Datum: Bedarf live im Formular, danach Karte „bis ca. …“ und „neu – ab … dabei“; bleibt nach dem Neuladen', async ({ page }) => {
    await oeffneSparziele(page);
    await page.getByRole('button', { name: '＋ Neues Sparziel' }).click();
    const d = dialog(page, 'Neues Sparziel');
    const vorschau = d.locator('.sz-vorschau');
    await expect(vorschau).toContainText('Nach Eingabe von Zielbetrag und Datum');
    await d.getByLabel('Name', { exact: true }).fill('Neues Fahrrad');
    await d.getByRole('group', { name: 'Symbol' }).getByRole('button', { name: 'Geschenk' }).click();
    await expect(d.getByRole('group', { name: 'Symbol' }).getByRole('button', { name: 'Geschenk' })).toHaveAttribute('aria-pressed', 'true');
    await d.getByRole('button', { name: 'Datum vorläufig (ca.)' }).click();
    await expect(d.getByLabel('Tag (optional)')).toHaveCount(0);
    await d.getByLabel('Monat', { exact: true }).selectOption({ label: 'September' });
    await d.getByLabel('Jahr').selectOption('2027');
    await d.getByLabel('Zielbetrag in Euro').fill('2.400');
    // Oktober noch ohne Kontostand von beiden → ab Oktober 2026 bis September 2027 = 12 Monate → 2.400 € / 12
    await expect(vorschau).toHaveText(`Ab Oktober 2026 → 12 Monate → ${betragText(20_000)} pro Monat`);
    await d.getByLabel('Zielbetrag in Euro').fill('3.600');
    await expect(vorschau).toHaveText(`Ab Oktober 2026 → 12 Monate → ${betragText(30_000)} pro Monat`);
    await d.getByRole('button', { name: 'Speichern' }).click();
    await erwarteToast(page, 'Gespeichert ✓');
    await expect(d).toBeHidden();

    const rad = karte(page, 'Neues Fahrrad');
    await expect(rad.locator('.sz-ziel-titel')).toContainText('🎁 Neues Fahrrad');
    await expect(rad.locator('.sz-ziel-titel small')).toHaveText('bis ca. September 2027 · vorläufig');
    await expect(rad.locator('.sz-status')).toHaveText('✓ neu – ab Oktober 2026 dabei');
    await expect(rad).toHaveAttribute('aria-label', /✓ neu – ab Oktober 2026 dabei$/);
    await expect(kopfWert(page, 'Nötig pro Monat')).toHaveText(betragText(v.noetigGesamt + 30_000));
    await page.reload();
    await expect(karte(page, 'Neues Fahrrad').locator('.sz-ziel-titel small')).toHaveText('bis ca. September 2027 · vorläufig');

    // ändern: der Bedarf rechnet mit dem neuen Betrag; ungültige Eingabe bleibt im Formular
    await karte(page, 'Neues Fahrrad').getByRole('button', { name: 'Neues Fahrrad ändern' }).click();
    const aendern = dialog(page, 'Sparziel ändern');
    await expect(aendern.getByLabel('Name', { exact: true })).toHaveValue('Neues Fahrrad');
    await aendern.getByLabel('Zielbetrag in Euro').fill('abc');
    await expect(aendern.locator('.sz-vorschau')).toHaveText('⚠ Bitte einen Zielbetrag zwischen 1 € und 999.999 € eingeben.');
    await aendern.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.locator('.toast.fehler')).toHaveText('Bitte einen Zielbetrag zwischen 1 € und 999.999 € eingeben.');
    await expect(aendern).toBeVisible();
  });

  test('aus „Frei“ zu einem Ziel verschieben: Frei sinkt, das Ziel wächst; im Verlauf steht die Verschiebung', async ({ page }) => {
    await oeffneSparziele(page);
    await page.getByRole('button', { name: 'Zu Ziel verschieben' }).click();
    const d = dialog(page, 'Zu Ziel verschieben');
    await expect(d.getByLabel('Zu welchem Ziel?').locator('option')).toHaveText([`${AUTO.emoji} Auto (offen ${betragText(AUTO.offen)})`, `${URLAUB.emoji} Sommerurlaub (offen ${betragText(URLAUB.offen)})`]);
    await d.getByLabel('Betrag in Euro').fill(String((v.frei + 100) / 100).replace('.', ','));
    await d.getByRole('button', { name: 'Verschieben' }).click();
    await expect(page.locator('.toast.fehler')).toContainText('mehr ist nicht frei');
    await page.locator('.toast').evaluateAll((t) => t.forEach((x) => x.remove())); // eine Fehlermeldung ließe „verschoben ✓“ nicht durch
    await d.getByLabel('Zu welchem Ziel?').selectOption({ label: `${URLAUB.emoji} Sommerurlaub (offen ${betragText(URLAUB.offen)})` });
    await d.getByLabel('Betrag in Euro').fill('100');
    await d.getByRole('button', { name: 'Verschieben' }).click();
    await erwarteToast(page, `100 € zu ${URLAUB.emoji} Sommerurlaub verschoben ✓`);
    await expect(d).toBeHidden();
    await expect(frei(page)).toHaveText(betragText(v.frei - 10_000));
    await expect(kopfWert(page, 'Frei verfügbar')).toHaveText(betragText(v.frei - 10_000));
    await expect(karte(page, 'Sommerurlaub').locator('.sz-stand-text')).toContainText(`${betragText(URLAUB.gespart + 10_000)} von`);
    await expect(kopf(page).locator('.fk-gross')).toHaveText(betragText(v.summeZiele + 10_000));
    const oktober = page.locator('.sz-monat[data-monat="2026-10"]');
    await expect(oktober.locator('.sz-verschoben > span')).toHaveText(`💜 → ${URLAUB.emoji} Sommerurlaub (aus Frei verschoben)`);
    await expect(oktober.locator('.sz-verschoben > b')).toHaveText('+100 €');
    await expect(oktober.locator('.sz-verschoben').getByRole('button', { name: 'Rückgängig' })).toBeVisible();
  });

  test('Verschiebung „Rückgängig“: Rückfrage mit der tatsächlichen Wirkung, dann geht das Geld zurück zu Frei; die Meldung mit „Rückgängig“ holt sie wieder', async ({ page }) => {
    await oeffneSparziele(page);
    await page.getByRole('button', { name: 'Zu Ziel verschieben' }).click();
    const d = dialog(page, 'Zu Ziel verschieben');
    await d.getByLabel('Zu welchem Ziel?').selectOption({ label: `${URLAUB.emoji} Sommerurlaub (offen ${betragText(URLAUB.offen)})` });
    await d.getByLabel('Betrag in Euro').fill('100');
    await d.getByRole('button', { name: 'Verschieben' }).click();
    await expect(frei(page)).toHaveText(betragText(v.frei - 10_000));
    const zeileV = page.locator('.sz-monat[data-monat="2026-10"] .sz-verschoben');
    await zeileV.getByRole('button', { name: 'Rückgängig' }).click();
    const frage = dialog(page, 'Verschiebung rückgängig machen?');
    // eine Verschiebung dieses Monats (noch ohne Kontostand) wirkt genau mit ihrem Betrag
    await expect(frage).toContainText(`„Frei verfügbar“ steigt dadurch um 100 €; „Sommerurlaub“ hat danach 100 € weniger.`);
    await frage.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(frei(page)).toHaveText(betragText(v.frei - 10_000));
    const toasts = await fehlerToastsZaehlen(page);
    await zeileV.getByRole('button', { name: 'Rückgängig' }).click();
    await dialog(page, 'Verschiebung rückgängig machen?').getByRole('button', { name: 'Rückgängig machen' }).click();
    const meldung = page.locator('.toast').filter({ hasText: 'Verschiebung rückgängig gemacht ✓' });
    await expect(meldung).toBeVisible();
    await expect(frei(page)).toHaveText(betragText(v.frei));
    await expect(zeileV).toHaveCount(0);
    await expect(karte(page, 'Sommerurlaub').locator('.sz-stand-text')).toContainText(`${betragText(URLAUB.gespart)} von`);
    // „Rückgängig“ in der Meldung: die Verschiebung ist wieder da
    await meldung.getByRole('button', { name: 'Rückgängig' }).click();
    await erwarteToast(page, 'Verschiebung wieder da ✓');
    await expect(frei(page)).toHaveText(betragText(v.frei - 10_000));
    await expect(zeileV).toHaveCount(1);
    expect(await toasts.anzahl()).toBe(0);
    await page.reload();
    await expect(frei(page)).toHaveText(betragText(v.frei - 10_000));
  });

  test('gefördertes laufendes Ziel löschen: sein Geld geht zu Frei, die Vergangenheit bleibt; Zeile „🗑️ … gelöscht“; „Rückgängig“ holt es zurück', async ({ page }) => {
    await oeffneSparziele(page);
    const ohne = sparVerlauf(zielLoeschen(demo.ziele, 'demo0002', { heute: WERKTAG_DATUM, konto: demo.konto }), demo.konto, WERKTAG_DATUM);
    expect(ohne.frei).toBe(v.frei + URLAUB.gespart);
    expect(ohne.frei + ohne.summeZiele).toBe(v.frei + v.summeZiele);
    // eine noch stehende Fehlermeldung (frühere Aktion) verschluckt die Meldung mit „Rückgängig“ nicht (M4)
    await page.getByRole('button', { name: 'Zu Ziel verschieben' }).click();
    await dialog(page, 'Zu Ziel verschieben').getByLabel('Betrag in Euro').fill(String((v.frei + 100) / 100).replace('.', ','));
    await dialog(page, 'Zu Ziel verschieben').getByRole('button', { name: 'Verschieben' }).click();
    await expect(page.locator('.toast.fehler')).toContainText('mehr ist nicht frei');
    await dialog(page, 'Zu Ziel verschieben').getByRole('button', { name: 'Abbrechen' }).click();
    await karte(page, 'Sommerurlaub').getByRole('button', { name: 'Sommerurlaub ändern' }).click();
    await dialog(page, 'Sparziel ändern').getByRole('button', { name: 'Löschen', exact: true }).click();
    const frage = dialog(page, 'Sparziel löschen?');
    await expect(frage).toContainText(`„Sommerurlaub“ wird gelöscht. Das bisher zugeteilte Geld (${betragText(URLAUB.gespart)}) geht zu „Frei verfügbar“ – von dort kannst du es einem anderen Ziel geben.`);
    const toasts = await fehlerToastsZaehlen(page);
    await frage.getByRole('button', { name: 'Löschen', exact: true }).click();
    const meldung = page.locator('.toast').filter({ hasText: 'Gelöscht ✓' });
    await expect(meldung.getByRole('button', { name: 'Rückgängig' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(karte(page, 'Sommerurlaub')).toHaveCount(0);
    await expect(frei(page)).toHaveText(betragText(ohne.frei));
    await expect(kopf(page).locator('.fk-gross')).toHaveText(betragText(ohne.summeZiele));
    await expect(page.locator('.sz-monat[data-monat="2026-10"] .sz-abschluss')).toHaveText(`🗑️ Sommerurlaub gelöscht – ${betragText(URLAUB.gespart)} zurück zu „Frei“+${betragText(URLAUB.gespart)} → Frei`);
    await expect(page.locator('.sz-fertig[data-id="demo0002"]')).toHaveCount(0); // nicht unter „Abgeschlossene Ziele“
    await meldung.getByRole('button', { name: 'Rückgängig' }).click();
    await erwarteToast(page, 'Wiederhergestellt ✓');
    await expect(karte(page, 'Sommerurlaub')).toHaveCount(1);
    await expect(frei(page)).toHaveText(betragText(v.frei));
    await expect(kopf(page).locator('.fk-gross')).toHaveText(betragText(v.summeZiele));
    expect(await toasts.anzahl()).toBe(0);
    await page.reload();
    await expect(karte(page, 'Sommerurlaub').locator('.sz-stand-text')).toContainText(`${betragText(URLAUB.gespart)} von`);
  });

  test('Ziel beenden → „Geld zurück zu Frei“: Frei wächst um das Gesparte, das Ziel steht im Verlauf', async ({ page }) => {
    await oeffneSparziele(page);
    await karte(page, 'Sommerurlaub').getByRole('button', { name: 'Sommerurlaub ändern' }).click();
    await dialog(page, 'Sparziel ändern').getByRole('button', { name: 'Ziel beenden' }).click();
    const d = dialog(page, '„Sommerurlaub“ beenden');
    await expect(d.getByRole('button', { name: /Geld wurde ausgegeben/ })).toBeVisible();
    await d.getByRole('button', { name: /Geld zurück zu Frei/ }).click();
    await erwarteToast(page, 'Ziel beendet – Geld zurück zu Frei ✓');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(frei(page)).toHaveText(betragText(v.frei + URLAUB.gespart));
    await expect(karte(page, 'Sommerurlaub')).toHaveCount(0);
    await expect(kopf(page).locator('.fk-gross')).toHaveText(betragText(v.summeZiele - URLAUB.gespart));
    const fertig = page.locator('.sz-fertig[data-id="demo0002"]');
    await expect(fertig).toContainText(`Beendet im Oktober 2026 · ${betragText(URLAUB.gespart)} zurück zu Frei`);
    await expect(page.locator('.sz-monat[data-monat="2026-10"] .sz-abschluss')).toHaveText(`${URLAUB.emoji} Sommerurlaub beendet – zurück zu Frei+${betragText(URLAUB.gespart)} → Frei`);
  });

  test('Verlauf pro Monat: Ersparnis je Monat wie in der Domäne, Aufteilung ergibt auf den Cent die Ersparnis; anteilig erklärt', async ({ page }) => {
    await oeffneSparziele(page);
    const monate = page.locator('.sz-monat');
    await expect(monate).toHaveCount(v.monate.length);
    await expect(monate.locator('.sz-monat-titel > span:first-child')).toHaveText(v.monate.map((m) => `${['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'][Number(m.monat.slice(5)) - 1]} ${m.monat.slice(0, 4)}`));
    await expect(monate.locator('.sz-delta')).toHaveText(v.monate.map((m) => deltaText(m.gespart)));
    for (const karteM of await monate.all()) {
      const gespart = Number(await karteM.getAttribute('data-gespart'));
      const teile = await karteM.locator('.sz-teil').evaluateAll((z) => z.map((x) => Number(x.dataset.cents)));
      expect(teile.reduce((a, b) => a + b, 0), await karteM.getAttribute('data-monat')).toBe(gespart);
    }
    // Juni: weniger als nötig → anteilig, mit Erklärung; August: Minus nimmt zuerst aus Frei
    await expect(page.locator('.sz-monat[data-monat="2026-06"]')).toContainText('anteilig nach Bedarf aufgeteilt');
    await expect(page.locator('.sz-monat[data-monat="2026-08"] .sz-teil').first()).toHaveText('💜 Frei verfügbar zuerst−0 € (leer)');
    await expect(page.locator('.sz-monat[data-monat="2026-09"] .sz-abschluss')).toContainText('Neues Sofa abgeschlossen (ausgegeben)');
    // Ausgleich: das Sofa wurde bezahlt, die Zahlung steckt schon im Kontostand → Zeile „… bezahlt (aus dem Ziel)“, Summe stimmt weiter
    const sept = v.monate.find((m) => m.monat === '2026-09');
    expect(sept.ausgleich).toBeGreaterThan(0);
    await expect(page.locator('.sz-monat[data-monat="2026-09"] .sz-teil').first()).toHaveText(`🛋️ Neues Sofa bezahlt (aus dem Ziel)${deltaText(-sept.ausgleich)}`);
    await expect(page.locator('.sz-monat[data-monat="2026-09"] .sz-ausgleich')).toContainText(`Ausgleich: ${betragText(sept.ausgleich)}`);
    await expect(page.locator('.sz-hinweis').filter({ hasText: '„Gespart“ =' })).toContainText('höchstens einen Monat später');
    expect(v.summeZiele + v.frei + v.ausgleichOffen).toBe(v.monate.reduce((a, m) => a + (m.gespart ?? 0) + m.ungedeckt, 0));
  });

  test('automatisch abgeschlossenes Ziel: ✎ mit neuem Datum öffnet es wieder; „Doch nicht ausgegeben – zurück zu Frei“ mit Rückfrage', async ({ page }) => {
    await oeffneSparziele(page);
    const sofa = page.locator('.sz-fertig[data-id="demo0003"]');
    await expect(sofa.getByRole('button', { name: 'Doch nicht ausgegeben – zurück zu Frei' })).toBeVisible();
    await sofa.getByRole('button', { name: 'Neues Sofa ändern (wieder öffnen)' }).click();
    const d = dialog(page, 'Sparziel wieder öffnen');
    await expect(d).toContainText('Nach dem Zieldatum abgeschlossen');
    await expect(d.getByRole('button', { name: 'Ziel beenden' })).toHaveCount(0);
    await d.getByRole('button', { name: 'Speichern' }).click(); // altes Datum → klare Meldung, bleibt offen
    await expect(page.locator('.toast.fehler')).toContainText('Das Datum liegt in der Vergangenheit');
    await expect(d).toBeVisible();
    await page.locator('.toast').evaluateAll((t) => t.forEach((x) => x.remove()));
    await d.getByLabel('Monat', { exact: true }).selectOption({ label: 'Dezember' });
    await d.getByLabel('Jahr').selectOption('2026');
    await d.getByRole('button', { name: 'Speichern' }).click();
    await erwarteToast(page, 'Gespeichert ✓');
    await expect(karte(page, 'Neues Sofa')).toHaveCount(1);
    await expect(page.locator('.sz-fertig[data-id="demo0003"]')).toHaveCount(0);
    await page.reload();
    await expect(karte(page, 'Neues Sofa').locator('.sz-ziel-titel small')).toHaveText('bis Dezember 2026');
  });

  test('„Doch nicht ausgegeben – zurück zu Frei“: das Gesparte geht zu Frei, kein Ausgleich mehr; Summe bleibt', async ({ page }) => {
    await oeffneSparziele(page);
    const sofa = demo.ziele.z.find((z) => z.id === 'demo0003');
    const nachher = sparVerlauf(zielBeenden(demo.ziele, 'demo0003', { monat: zielSchluss(sofa).monat, art: 'frei' }), demo.konto, WERKTAG_DATUM);
    const zeile = page.locator('.sz-fertig[data-id="demo0003"]');
    await zeile.getByRole('button', { name: 'Doch nicht ausgegeben – zurück zu Frei' }).click();
    const frage = dialog(page, 'Doch nicht ausgegeben?');
    await expect(frage).toContainText('„Neues Sofa“');
    await frage.getByRole('button', { name: 'Zurück zu Frei' }).click();
    await erwarteToast(page, 'Zurück zu Frei ✓');
    await expect(frei(page)).toHaveText(betragText(nachher.frei));
    expect(nachher.frei + nachher.summeZiele).toBe(v.frei + v.summeZiele);
    await expect(page.locator('.sz-fertig[data-id="demo0003"]')).toContainText('zurück zu Frei');
    await expect(page.locator('.sz-fertig[data-id="demo0003"]').getByRole('button', { name: 'Doch nicht ausgegeben – zurück zu Frei' })).toHaveCount(0);
    for (const karteM of await page.locator('.sz-monat').all()) {
      const gespart = Number(await karteM.getAttribute('data-gespart'));
      if (Number.isNaN(gespart)) continue;
      const teile = await karteM.locator('.sz-teil').evaluateAll((z) => z.map((x) => Number(x.dataset.cents)));
      expect(teile.reduce((a, b) => a + b, 0)).toBe(gespart);
    }
  });

  test('abgeschlossenes Ziel mit Geld: nur Ausblenden / Einblenden; laufendes Ziel: „Löschen“ mit Rückfrage', async ({ page }) => {
    await oeffneSparziele(page);
    const sofa = page.locator('.sz-fertig[data-id="demo0003"]');
    await expect(sofa.getByRole('button', { name: 'Endgültig löschen' })).toHaveCount(0);
    await sofa.getByRole('button', { name: 'Ausblenden' }).click();
    await erwarteToast(page, 'Ausgeblendet ✓');
    await expect(page.locator('.sz-fertig[data-id="demo0003"]')).toHaveCount(0);
    await page.getByLabel('Ausgeblendete zeigen (1)').check();
    await page.locator('.sz-fertig[data-id="demo0003"]').getByRole('button', { name: 'Einblenden' }).click();
    await erwarteToast(page, 'Eingeblendet ✓');
    await expect(page.locator('.sz-fertig[data-id="demo0003"]').getByRole('button', { name: 'Ausblenden' })).toBeVisible();

    // ein versehentlich angelegtes Ziel (noch kein Geld) lässt sich löschen – erst nach der Rückfrage
    await page.getByRole('button', { name: '＋ Neues Sparziel' }).click();
    const neu = dialog(page, 'Neues Sparziel');
    await neu.getByLabel('Name', { exact: true }).fill('Versehen');
    await neu.getByLabel('Zielbetrag in Euro').fill('500');
    await neu.getByRole('button', { name: 'Speichern' }).click();
    await expect(neu).toBeHidden();
    await expect(karte(page, 'Auto').getByRole('button', { name: 'Auto ändern' })).toBeVisible();
    await karte(page, 'Auto').getByRole('button', { name: 'Auto ändern' }).click();
    // laufend und gefördert: seit 1.1.1 ebenfalls löschbar (das Geld wird neu verteilt)
    await expect(dialog(page, 'Sparziel ändern').getByRole('button', { name: 'Löschen', exact: true })).toBeVisible();
    await expect(dialog(page, 'Sparziel ändern').getByRole('button', { name: 'Endgültig löschen' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await karte(page, 'Versehen').getByRole('button', { name: 'Versehen ändern' }).click();
    await dialog(page, 'Sparziel ändern').getByRole('button', { name: 'Löschen', exact: true }).click();
    const frage = dialog(page, 'Sparziel löschen?');
    await expect(frage).toContainText('„Versehen“ hat noch kein Geld bekommen und wird gelöscht.');
    await frage.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(karte(page, 'Versehen')).toHaveCount(1);
    await dialog(page, 'Sparziel ändern').getByRole('button', { name: 'Löschen', exact: true }).click();
    await dialog(page, 'Sparziel löschen?').getByRole('button', { name: 'Löschen', exact: true }).click();
    await erwarteToast(page, 'Gelöscht ✓');
    await expect(karte(page, 'Versehen')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.reload();
    await expect(karte(page, 'Versehen')).toHaveCount(0);
  });

  test('ohne Kontostand von beiden: „Sobald ihr beide …“; ohne Ziele ein Hinweis', async ({ page }) => {
    await starteDemo(page, { route: '#/konto' });
    await page.getByRole('button', { name: 'Beispieldaten entfernen' }).click();
    await dialog(page, 'Beispieldaten entfernen?').getByRole('button', { name: 'Entfernen' }).click();
    await erwarteToast(page, 'Beispieldaten entfernt');
    await umschalter(page).getByRole('button', { name: 'Sparziele' }).click();
    await expect(page.locator('.sz-ohne-konto')).toHaveText('Sobald ihr beide einen Kontostand eingetragen habt, wird verteilt.');
    await expect(page.getByText('Noch keine Sparziele.')).toBeVisible();
    await expect(kopf(page).locator('.sz-stand')).toHaveText('Stand: noch kein Kontostand von beiden');
    await expect(page.locator('.sz-ziel')).toHaveCount(0);
  });

  test('unlesbare Sparziele: klare Meldung, nichts änderbar', async ({ page }) => {
    await starteDemo(page, { route: '#/konto', speicher: { 'fk.konto.ansicht.v1': 'sparziele' } });
    await page.evaluate(() => {
      const daten = JSON.parse(localStorage.getItem('fk.demo.v1'));
      daten.ziele = '{"v":2,"z":[]}';
      localStorage.setItem('fk.demo.v1', JSON.stringify(daten));
    });
    await page.reload();
    await expect(page.locator('.sz-meldung.warn')).toContainText('🔒 Sparziele unlesbar');
    await expect(page.locator('.sz-meldung.warn')).toContainText(TEXT_ZIELE_GESPERRT);
    await expect(page.getByRole('button', { name: '＋ Neues Sparziel' })).toBeDisabled();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('fk.demo.v1')).ziele)).toBe('{"v":2,"z":[]}');
  });
});

test.describe('Sparziele: Rückfrage mit Animation (Doppeltipp) und Grenzen beim Verschieben', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } }); // das Blatt gleitet hinaus: ein zweiter Tipp träfe sonst noch den Knopf

  test('„Zu Ziel verschieben“ über dem offenen Betrag → klare Meldung (m-4); Doppeltipp auf „Löschen“ löscht genau einmal (m-2)', async ({ page }) => {
    await oeffneSparziele(page);
    await page.getByRole('button', { name: '＋ Neues Sparziel' }).click();
    const neu = dialog(page, 'Neues Sparziel');
    await neu.getByLabel('Name', { exact: true }).fill('Kleinigkeit');
    await neu.getByLabel('Zielbetrag in Euro').fill('50');
    await neu.getByRole('button', { name: 'Speichern' }).click();
    await expect(neu).toBeHidden();
    await expect(karte(page, 'Kleinigkeit')).toHaveCount(1);

    await page.getByRole('button', { name: 'Zu Ziel verschieben' }).click();
    const d = dialog(page, 'Zu Ziel verschieben');
    await d.getByLabel('Zu welchem Ziel?').selectOption({ label: '🎯 Kleinigkeit (offen 50 €)' });
    await d.getByLabel('Betrag in Euro').fill('100');
    await d.getByRole('button', { name: 'Verschieben' }).click();
    await expect(page.locator('.toast.fehler')).toHaveText('Höchstens 50 € – mehr fehlt „🎯 Kleinigkeit“ nicht.');
    await expect(frei(page)).toHaveText(betragText(v.frei));
    await d.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.locator('.toast').evaluateAll((t) => t.forEach((x) => x.remove()));

    const toasts = await fehlerToastsZaehlen(page);
    await karte(page, 'Kleinigkeit').getByRole('button', { name: 'Kleinigkeit ändern' }).click();
    await dialog(page, 'Sparziel ändern').getByRole('button', { name: 'Löschen', exact: true }).click();
    await dialog(page, 'Sparziel löschen?').getByRole('button', { name: 'Löschen', exact: true }).dblclick();
    await erwarteToast(page, 'Gelöscht ✓');
    await expect(karte(page, 'Kleinigkeit')).toHaveCount(0);
    await page.waitForTimeout(600); // ein zweites Löschen hätte jetzt „gibt es nicht mehr“ gemeldet
    expect(await toasts.anzahl()).toBe(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

// Google-Attrappe: Kontostand Juli–September (beide), ein erfundenes Ziel ab August
const KONTO = { v: 1, p: { papa: { '2026-07': 600_000, '2026-08': 700_000, '2026-09': 800_000 }, mama: { '2026-07': 400_000, '2026-08': 500_000, '2026-09': 550_000 } }, x: [] };
const ZIELE = { v: 1, beginn: '2026-08', z: [{ id: 'aaaa0001', name: 'Rad', emoji: '🎁', zielCents: 600_000, datum: '2027-07', vorlaeufig: false, erstellt: '2026-08' }], m: [] };
const G = sparVerlauf(ZIELE, KONTO, WERKTAG_DATUM);
const fehler500 = (route) => route.fulfill({ status: 500, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: { code: 500, message: 'kaputt' } }) });

test.describe('Sparziele mit Google', () => {
  test.use({ erlaubteFehler: NETZFEHLER }); // fehlende versteckte Ereignisse antworten 404, gescheiterte Anfragen 500

  test('Speichern scheitert (HTTP 500): Meldung, nichts geändert, Knöpfe wieder benutzbar', async ({ page }) => {
    test.setTimeout(90_000); // der Store versucht das Schreiben mehrmals, bevor er aufgibt
    await starteGoogleVerbunden(page, { route: '#/konto', ereignisse: [kontoZuEreignis(KONTO).body, zieleZuEreignis(ZIELE).body], speicher: { 'fk.konto.ansicht.v1': 'sparziele' } });
    await expect(page.getByRole('heading', { name: 'Sparziele 💶' })).toBeVisible();
    await expect(frei(page)).toHaveText(betragText(G.frei));
    // ab jetzt scheitert jedes Schreiben der Sparziele (nach kurzer Wartezeit, damit der laufende Zustand zu sehen ist)
    await page.route(/\/events(\/fksparen)?(\?.*)?$/, async (route) => {
      if (route.request().method() === 'GET') return route.fallback();
      await new Promise((fertig) => setTimeout(fertig, 400));
      return fehler500(route);
    });

    const toasts = await fehlerToastsZaehlen(page); // jeder Fehler: genau EINE Meldung (die der Shell aus state.fehler)

    await page.getByRole('button', { name: 'Zu Ziel verschieben' }).click();
    const d = dialog(page, 'Zu Ziel verschieben');
    await d.getByLabel('Betrag in Euro').fill('100');
    const verschieben = d.getByRole('button', { name: 'Verschieben' });
    await verschieben.click();
    await expect(verschieben).toBeDisabled();
    await expect(page.locator('.toast.fehler')).toHaveText('Speichern hat nicht geklappt. Bitte noch einmal versuchen.', { timeout: 15_000 });
    await expect(verschieben).toBeEnabled();
    expect(await toasts.anzahl()).toBe(1);
    await expect(frei(page)).toHaveText(betragText(G.frei));
    await page.keyboard.press('Escape');

    await karte(page, 'Rad').getByRole('button', { name: 'Rad ändern' }).click();
    await dialog(page, 'Sparziel ändern').getByRole('button', { name: 'Ziel beenden' }).click();
    const beenden = dialog(page, '„Rad“ beenden');
    await page.locator('.toast').evaluateAll((t) => t.forEach((x) => x.remove()));
    await toasts.zuruecksetzen();
    await beenden.getByRole('button', { name: /Geld zurück zu Frei/ }).click();
    await expect(beenden.getByRole('button', { name: /Geld wurde ausgegeben/ })).toBeDisabled();
    await expect(page.locator('.toast.fehler')).toBeVisible({ timeout: 15_000 });
    await expect(beenden.getByRole('button', { name: /Geld zurück zu Frei/ })).toBeEnabled();
    await expect(beenden.getByRole('button', { name: /Geld wurde ausgegeben/ })).toBeEnabled();
    expect(await toasts.anzahl()).toBe(1);
    await beenden.getByRole('button', { name: 'Abbrechen' }).click(); // Escape schlösse beide Blätter
    await expect(karte(page, 'Rad')).toHaveCount(1);
    await expect(frei(page)).toHaveText(betragText(G.frei));

    const formular = dialog(page, 'Sparziel ändern');
    await formular.getByLabel('Name', { exact: true }).fill('Rad neu');
    await page.locator('.toast').evaluateAll((t) => t.forEach((x) => x.remove()));
    await toasts.zuruecksetzen();
    await formular.getByRole('button', { name: 'Speichern' }).click();
    // während gespeichert wird, ist das ganze Blatt aus (m-3)
    await expect(formular.getByRole('button', { name: 'Speichert …' })).toBeDisabled();
    await expect(formular.getByRole('button', { name: 'Ziel beenden' })).toBeDisabled();
    await expect(formular.getByLabel('Name', { exact: true })).toBeDisabled();
    await expect(page.locator('.toast.fehler')).toBeVisible({ timeout: 15_000 });
    const speichern = formular.getByRole('button', { name: 'Speichern' });
    await expect(speichern).toBeEnabled();
    await expect(formular.getByRole('button', { name: 'Ziel beenden' })).toBeEnabled();
    expect(await toasts.anzahl()).toBe(1);
    // vor dem Schreiben Abgelehntes zeigt die Oberfläche selbst – ebenfalls genau einmal
    await page.locator('.toast').evaluateAll((t) => t.forEach((x) => x.remove()));
    await toasts.zuruecksetzen();
    await formular.getByLabel('Name', { exact: true }).fill('');
    await speichern.click();
    await expect(page.locator('.toast.fehler')).toHaveText('Bitte einen Namen eingeben.');
    expect(await toasts.anzahl()).toBe(1);
    await formular.getByLabel('Name', { exact: true }).fill('Rad neu');
    await expect(formular.getByLabel('Name', { exact: true })).toHaveValue('Rad neu'); // die Eingabe bleibt
    await page.keyboard.press('Escape');
    await expect(karte(page, 'Rad')).toHaveCount(1);
  });

  test('Lesefehler beim Öffnen: alter Stand bleibt, gesperrt mit Meldung; „Nochmal versuchen“ liest neu', async ({ page }) => {
    await starteGoogleVerbunden(page, { route: '#/konto', ereignisse: [kontoZuEreignis(KONTO).body, zieleZuEreignis(ZIELE).body] });
    await expect(page.getByRole('heading', { name: 'Kontostand 💶' })).toBeVisible();
    await page.route(/\/events\/fksparen(\?.*)?$/, (route) => fehler500(route));
    await umschalter(page).getByRole('button', { name: 'Sparziele' }).click();
    const meldung = page.locator('.sz-meldung.warn');
    await expect(meldung).toContainText(TEXT_ZIELE_NICHT_GELADEN, { timeout: 15_000 });
    await expect(karte(page, 'Rad')).toHaveCount(1);
    await expect(page.getByRole('button', { name: '＋ Neues Sparziel' })).toBeDisabled();
    await expect(karte(page, 'Rad').getByRole('button', { name: 'Rad ändern' })).toBeDisabled();
    await page.unroute(/\/events\/fksparen(\?.*)?$/);
    await meldung.getByRole('button', { name: 'Nochmal versuchen' }).click();
    await expect(page.locator('.sz-meldung')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '＋ Neues Sparziel' })).toBeEnabled();
  });
});
