// „Versicherung“ im Konto-Tab (Demo, Mittwoch 14.10.2026; läuft in Klassisch, Glas und Bento): Umschalter mit vier Stellungen (gemerkt),
// Gesamt „Noch X € von 3.144 €“, Karten mit ⏳ eingereicht und ✓ erstattet getrennt, Rechnungen neueste zuerst, „＋ Rechnung einreichen“
// mit Vorschau „⚠ Limit überschritten“, „Erstattung erhalten“, Löschen mit „Rückgängig“ (Blatt und Wischen), Jahr blättern, „Polizze
// bearbeiten“ (Limit ändern; eine Kategorie mit Rechnungen lässt sich nicht entfernen – C4) und der leere Zustand mit der Vorlage
// „MedPLUS Privatarzt Basic“. Erwartete Zahlen aus der Domäne (jahresStand mit den Demo-Daten); die Demo („Mia“) ist erfunden.
import { test, expect, starteDemo, erwarteToast, WERKTAG_DATUM } from './hilfen.js';
import { seedDemo } from '../../src/app/seed.js';
import { betragText } from '../../src/domain/konto.js';
import { jahresStand, rechnungenDesJahres } from '../../src/domain/versicherung-rechnung.js';

test.use({ viewport: { width: 375, height: 812 } });

const demo = seedDemo(WERKTAG_DATUM).versicherung;
const POLIZZE = demo.daten.polizze;
const STAND = jahresStand(POLIZZE, rechnungenDesJahres(demo.teile, 2026), 2026);
const kat = (id) => STAND.kategorien.find((k) => k.id === id);

const umschalter = (page) => page.getByRole('group', { name: 'Ansicht im Konto' });
const karte = (page, id) => page.locator(`.vs-kat[data-kategorie="${id}"]`);
const zeilen = (page) => page.locator('.vs-liste .au-eintrag');
const blatt = (page, name) => page.getByRole('dialog', { name });

async function oeffne(page) {
  await starteDemo(page, { route: '#/konto/versicherung' });
  await expect(page.getByRole('heading', { name: 'Versicherung 🩺' })).toBeVisible();
  await expect(page.locator('.vs-kopf')).toBeVisible();
}

test.describe('Versicherung im Konto-Tab (Demo)', () => {
  test('Umschalter mit vier Stellungen, passt in eine Zeile; gemerkt nach dem Neuladen; #/konto/versicherung', async ({ page }) => {
    await starteDemo(page, { route: '#/konto' });
    await expect(umschalter(page).getByRole('button')).toHaveText(['Kontostand', 'Fixkosten', 'Sparziele', 'Versicherung']);
    const masse = await umschalter(page).getByRole('button').evaluateAll((l) => l.map((b) => [b.scrollWidth <= b.clientWidth + 1, b.getBoundingClientRect().height, parseFloat(getComputedStyle(b).fontSize)]));
    for (const [passt, hoehe, schrift] of masse) {
      expect(passt).toBe(true);
      expect(hoehe).toBeGreaterThanOrEqual(44);
      expect(schrift).toBeGreaterThanOrEqual(13);
    }
    await umschalter(page).getByRole('button', { name: 'Versicherung' }).click();
    await expect(page.getByRole('heading', { name: 'Versicherung 🩺' })).toBeVisible();
    await expect(page).toHaveTitle('Familienkalender · Versicherung');
    expect(await page.evaluate(() => localStorage.getItem('fk.konto.ansicht.v1'))).toBe('versicherung');
    await page.reload();
    await expect(umschalter(page).getByRole('button', { name: 'Versicherung' })).toHaveAttribute('aria-pressed', 'true');
    await umschalter(page).getByRole('button', { name: 'Kontostand' }).click();
    await expect(page.getByRole('heading', { name: 'Kontostand 💶' })).toBeVisible();
    await page.evaluate(() => {
      location.hash = '#/konto/versicherung';
    });
    await expect(page.getByRole('heading', { name: 'Versicherung 🩺' })).toBeVisible();
    await expect(page).toHaveURL(/#\/konto$/);
  });

  test('Gesamt, Karten (⏳ eingereicht und ✓ erstattet getrennt), Hinweis 80 %, Rechnungen neueste zuerst; Ziele ≥ 44 px', async ({ page }) => {
    await oeffne(page);
    await expect(page.locator('.vs-gesamt')).toHaveText(`Noch ${betragText(STAND.gesamt.restCent)} von 3.144 €`);
    await expect(page.locator('.vs-polizze')).toContainText('MedPLUS Privatarzt Basic · Mia');
    await expect(page.locator('.vs-hinweis')).toContainText('80 %');
    await expect(page.locator('.vs-kat .vs-kat-titel > span')).toHaveText(POLIZZE.kategorien.map((k) => k.name));
    const medi = karte(page, 'medi');
    await expect(medi.locator('.vs-kat-titel small')).toHaveText('Limit 415 €');
    await expect(medi.locator('.vs-raster b')).toHaveText([betragText(kat('medi').verbrauchtCent), betragText(kat('medi').restCent)]);
    await expect(medi.locator('.vs-pille')).toHaveText([`⏳ eingereicht: ${betragText(kat('medi').eingereichtCent)}`, `✓ erstattet: ${betragText(kat('medi').erstattetCent)}`]);
    await expect(page.getByRole('progressbar', { name: 'Verbraucht Medikamente/Rezeptgebühren' })).toBeVisible();
    await expect(karte(page, 'arzt').locator('.vs-pille')).toHaveCount(0);
    await expect(zeilen(page).locator('.vs-status')).toHaveText(['⏳ eingereicht am 10.10.2026', '✓ erstattet: 12,16 € am 11.10.2026']);
    await expect(zeilen(page).locator('.vs-betrag')).toHaveText(['19,80 €', '15,20 €']);
    await expect(page.getByRole('button', { name: 'Vorheriges Jahr' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Nächstes Jahr' })).toBeDisabled();
    const hoehen = await page.locator('.screen.versicherung button:visible').evaluateAll((l) => l.map((b) => [b.textContent, b.getBoundingClientRect().height, b.getBoundingClientRect().width]));
    expect(hoehen.length).toBeGreaterThan(6);
    for (const [text, hoehe, breite] of hoehen) {
      expect(hoehe, text).toBeGreaterThanOrEqual(44);
      expect(breite, text).toBeGreaterThanOrEqual(44);
    }
  });

  test('Rechnung einreichen: Vorschau „⚠ Limit überschritten“, danach an Karte und Rechnung; Pflichtfelder', async ({ page }) => {
    await oeffne(page);
    await page.getByRole('button', { name: '＋ Rechnung einreichen' }).click();
    const b = blatt(page, '＋ Rechnung einreichen');
    await expect(b.getByRole('textbox', { name: 'Rechnungsdatum', exact: true })).toHaveValue('14.10.2026');
    await expect(b.getByRole('textbox', { name: 'Eingereicht am', exact: true })).toHaveValue('14.10.2026');
    await b.getByRole('button', { name: 'Einreichen' }).click();
    await erwarteToast(page, 'Bitte den Betrag der Rechnung eingeben');
    await b.getByRole('combobox', { name: 'Kategorie' }).selectOption({ label: 'Heilbehelfe' });
    await b.getByRole('textbox', { name: 'Betrag in Euro' }).fill('230');
    await expect(b.locator('.vs-vorschau')).toHaveText('⚠ Limit überschritten – ca. 6 € werden nicht erstattet');
    await b.getByRole('textbox', { name: 'Betrag in Euro' }).fill('189,90');
    await expect(b.locator('.vs-vorschau')).toBeHidden();
    await b.getByRole('textbox', { name: 'Betrag in Euro' }).fill('230');
    await b.getByRole('textbox', { name: 'Arzt oder Apotheke' }).fill('Optiker');
    await b.getByRole('button', { name: 'Einreichen' }).click();
    await erwarteToast(page, 'Eingereicht ✓');
    await expect(b).toBeHidden();
    await expect(karte(page, 'heil').locator('.vs-warnung')).toHaveText('⚠ Limit überschritten – ca. 6 € werden nicht erstattet');
    await expect(karte(page, 'heil').locator('.vs-noch')).toHaveText('0 €');
    await expect(zeilen(page).first()).toContainText('Heilbehelfe');
    await expect(zeilen(page).first()).toContainText('Rechnung vom 14.10.2026 · Optiker');
    await expect(zeilen(page).first().locator('.vs-warnung')).toHaveText('⚠ Limit überschritten – ca. 6 € werden nicht erstattet');
    await page.reload();
    await expect(zeilen(page)).toHaveCount(3);
  });

  test('Erstattung erhalten: Betrag + Datum; die Rechnung zählt danach mit der Erstattung, ändern und entfernen', async ({ page }) => {
    await oeffne(page);
    await zeilen(page).first().click();
    const b = blatt(page, '🧾 Rechnung ändern');
    await expect(b.locator('.vs-erstattung-box')).toContainText('⏳ Noch keine Erstattung');
    await b.getByRole('button', { name: '✓ Erstattung erhalten' }).click();
    const e = blatt(page, '✓ Erstattung erhalten');
    await expect(e).toContainText('80 % von 19,80 € wären 15,84 €.');
    await e.getByRole('textbox', { name: 'Erstatteter Betrag in Euro' }).fill('15,84');
    await e.getByRole('button', { name: 'Speichern' }).click();
    await erwarteToast(page, 'Erstattung gespeichert ✓');
    await expect(b.locator('.vs-erstattung-box')).toContainText('✓ Erstattung eingetragen');
    await expect(b.locator('.vs-erstattung-box')).toContainText('15,84 € am 14.10.2026');
    await b.getByRole('button', { name: 'Schließen' }).click();
    await expect(zeilen(page).first().locator('.vs-status')).toHaveText('✓ erstattet: 15,84 € am 14.10.2026');
    await expect(karte(page, 'medi').locator('.vs-pille')).toHaveText(['✓ erstattet: 28 €']);
    await expect(page.locator('.vs-gesamt')).toHaveText(`Noch ${betragText(314400 - 1216 - 1584)} von 3.144 €`);

    await zeilen(page).first().click();
    await blatt(page, '🧾 Rechnung ändern').getByRole('button', { name: 'Erstattung ändern' }).click();
    await blatt(page, 'Erstattung ändern').getByRole('button', { name: 'Erstattung entfernen' }).click();
    await blatt(page, 'Erstattung entfernen?').getByRole('button', { name: 'Entfernen' }).click();
    await erwarteToast(page, 'Erstattung entfernt ✓');
    await page.keyboard.press('Escape');
    await expect(zeilen(page).first().locator('.vs-status')).toHaveText('⏳ eingereicht am 10.10.2026');
  });

  test('Löschen im Blatt und durch Wischen, je mit „Rückgängig“', async ({ page }) => {
    await oeffne(page);
    await zeilen(page).first().click();
    await blatt(page, '🧾 Rechnung ändern').getByRole('button', { name: 'Löschen' }).click();
    await erwarteToast(page, 'Gelöscht ✓');
    await expect(zeilen(page)).toHaveCount(1);
    await expect(karte(page, 'medi').locator('.vs-pille')).toHaveText(['✓ erstattet: 12,16 €']);
    await page.locator('.toast').getByRole('button', { name: 'Rückgängig' }).click();
    await erwarteToast(page, 'Wiederhergestellt ✓');
    await expect(zeilen(page)).toHaveCount(2);

    const huelle = page.locator('.vs-liste .au-wisch').first();
    // (WebKit am Rechner kennt keinen Touch-Konstruktor: dort über das Blatt)
    const gewischt = await zeilen(page).first().evaluate((el) => {
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
      await zeilen(page).first().click();
      await blatt(page, '🧾 Rechnung ändern').getByRole('button', { name: 'Löschen' }).click();
    }
    await erwarteToast(page, 'Gelöscht ✓');
    await expect(zeilen(page)).toHaveCount(1);
    await page.reload();
    await expect(zeilen(page)).toHaveCount(1);
  });

  test('Jahr blättern: eine Rechnung vom Vorjahr (Warnung „vor dem Beginn“) öffnet ‹ 2025', async ({ page }) => {
    await oeffne(page);
    await page.getByRole('button', { name: '＋ Rechnung einreichen' }).click();
    const b = blatt(page, '＋ Rechnung einreichen');
    await b.getByRole('combobox', { name: 'Kategorie' }).selectOption({ label: 'Physiotherapie' });
    const datum = b.getByRole('textbox', { name: 'Rechnungsdatum', exact: true });
    await datum.fill('20.12.2025');
    await datum.press('Enter');
    await b.getByRole('textbox', { name: 'Betrag in Euro' }).fill('60');
    await b.getByRole('button', { name: 'Einreichen' }).click();
    await erwarteToast(page, 'vor dem Beginn der Polizze');
    await expect(page.getByRole('button', { name: 'Vorheriges Jahr' })).toBeEnabled();
    await page.getByRole('button', { name: 'Vorheriges Jahr' }).click();
    await expect(page.locator('.jahr-titel b')).toHaveText('2025');
    await expect(page.getByRole('heading', { name: 'Rechnungen 2025' })).toBeVisible();
    await expect(zeilen(page)).toHaveCount(1);
    await expect(karte(page, 'physio').locator('.vs-noch')).toHaveText('430 €');
    await page.getByRole('button', { name: 'Zum laufenden Jahr' }).click();
    await expect(page.locator('.jahr-titel b')).toHaveText('2026');
    await expect(zeilen(page)).toHaveCount(2);
  });

  test('Polizze bearbeiten: Limit ändern; eine Kategorie mit Rechnungen lässt sich nicht entfernen (C4)', async ({ page }) => {
    await oeffne(page);
    await page.getByRole('button', { name: 'Polizze bearbeiten' }).click();
    const b = blatt(page, 'Polizze bearbeiten');
    await expect(b.getByRole('textbox', { name: 'Limit der Kategorie 5 in Euro' })).toHaveValue('224');
    await expect(b.getByRole('button', { name: 'Medikamente/Rezeptgebühren entfernen' })).toBeDisabled();
    await expect(b.locator('.vs-kat-zeile[data-kategorie="medi"]')).toContainText('Hat Rechnungen');
    await expect(b.getByRole('button', { name: 'Psychotherapie entfernen' })).toBeEnabled();
    await b.getByRole('textbox', { name: 'Limit der Kategorie 5 in Euro' }).fill('250');
    await b.getByRole('button', { name: 'Speichern' }).click();
    await erwarteToast(page, 'Polizze gespeichert ✓');
    await expect(karte(page, 'heil').locator('.vs-kat-titel small')).toHaveText('Limit 250 €');
  });

  test('ohne Polizze: „MedPLUS Privatarzt Basic anlegen“ aus der Vorlage (Person, Beginn, Limits änderbar)', async ({ page }) => {
    await starteDemo(page, { route: '#/konto/kontostand' });
    await page.getByRole('button', { name: 'Beispieldaten entfernen' }).click();
    await page.getByRole('dialog', { name: 'Beispieldaten entfernen?' }).getByRole('button', { name: 'Entfernen' }).click();
    await erwarteToast(page, 'Beispieldaten entfernt');
    await umschalter(page).getByRole('button', { name: 'Versicherung' }).click();
    await expect(page.locator('.vs-leer')).toContainText('Noch keine Polizze');
    await expect(page.getByRole('button', { name: 'Eigene Polizze' })).toBeVisible();
    await page.getByRole('button', { name: 'MedPLUS Privatarzt Basic anlegen' }).click();
    const b = blatt(page, 'MedPLUS Privatarzt Basic anlegen');
    await expect(b.getByRole('textbox', { name: 'Maximum pro Jahr in Euro' })).toHaveValue('3.144');
    await expect(b.getByRole('textbox', { name: 'Beginn der Polizze', exact: true })).toHaveValue('14.10.2026');
    await b.getByRole('textbox', { name: 'Versicherte Person' }).fill('Mia');
    await b.getByRole('button', { name: 'Anlegen' }).click();
    await erwarteToast(page, 'Polizze angelegt ✓');
    await expect(page.locator('.vs-gesamt')).toHaveText('Noch 3.144 € von 3.144 €');
    await expect(page.locator('.vs-liste')).toContainText('Für 2026 ist noch keine Rechnung eingereicht.');
    await expect(page.locator('.vs-kat')).toHaveCount(5);
  });
});
