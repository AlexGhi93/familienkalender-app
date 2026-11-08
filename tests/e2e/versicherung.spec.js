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
    // erst nach dem ersten Messen (ResizeObserver) stabil – auf langsamen Rechnern (CI) also abwarten
    const knoepfe = umschalter(page).getByRole('button');
    await expect.poll(() => knoepfe.evaluateAll((l) => l.every((b) => b.scrollWidth <= b.clientWidth))).toBe(true);
    const masse = await knoepfe.evaluateAll((l) => l.map((b) => [b.getBoundingClientRect().height, parseFloat(getComputedStyle(b).fontSize)]));
    for (const [hoehe, schrift] of masse) {
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

  test('Abschluss-Review M2: ein Rechnungsdatum mehr als ein Jahr vor dem Beginn (Tippfehler im Jahr) wird abgelehnt, das Vorjahr nicht', async ({ page }) => {
    await oeffne(page);
    await page.getByRole('button', { name: '＋ Rechnung einreichen' }).click();
    const b = blatt(page, '＋ Rechnung einreichen');
    const datum = b.getByRole('textbox', { name: 'Rechnungsdatum', exact: true });
    await datum.fill('12.10.2016');
    await datum.press('Enter');
    await b.getByRole('textbox', { name: 'Betrag in Euro' }).fill('12');
    await b.getByRole('button', { name: 'Einreichen' }).click();
    await erwarteToast(page, `Das Rechnungsdatum liegt mehr als ein Jahr vor dem Beginn der Polizze (${POLIZZE.beginn.split('-').reverse().join('.')}). Bitte das Jahr prüfen.`);
    await expect(b).toBeVisible();
    await expect(zeilen(page)).toHaveCount(2);
    await datum.fill('12.10.2025');
    await datum.press('Enter');
    await b.getByRole('button', { name: 'Einreichen' }).click();
    await erwarteToast(page, 'vor dem Beginn der Polizze');
    await expect(b).toBeHidden();
    await expect(page.getByRole('button', { name: 'Vorheriges Jahr' })).toBeEnabled();
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

  // Abschluss-Review I1: Klassisch hat keine eigene Schrift – ob „Kontostand“/„Versicherung“ passen, hängt am Telefon (iPhone, Samsung)
  // bzw. am Rechner (Windows schmal, Linux/CI breit). Die Kurzform wird gemessen: sie erscheint genau dann, wenn der volle Name nicht passt.
  async function umschalterMasse(page) {
    return umschalter(page)
      .getByRole('button')
      .evaluateAll((l) =>
        l.map((b) => {
          const kurz = b.classList.contains('kurz');
          b.classList.remove('kurz');
          const passtLang = b.scrollWidth <= b.clientWidth;
          if (kurz) b.classList.add('kurz');
          const nach = getComputedStyle(b, '::after');
          return {
            name: b.getAttribute('aria-label') ?? b.textContent,
            kurzform: b.getAttribute('data-kurz'),
            kurz,
            passtLang,
            sichtbar: kurz ? nach.display !== 'none' && nach.content === `"${b.getAttribute('data-kurz')}"` : b.querySelector('.konto-segment-lang') ? getComputedStyle(b.querySelector('.konto-segment-lang')).display !== 'none' : true,
            ueber: b.scrollWidth - b.clientWidth,
            hoehe: b.getBoundingClientRect().height,
            schrift: parseFloat(getComputedStyle(b).fontSize),
          };
        }),
      );
  }

  async function umschalterPruefen(page, breite, { breiteSchrift = false } = {}) {
    await page.setViewportSize({ width: breite, height: 740 });
    const ort = `${breite} px${breiteSchrift ? ' (breite Schrift)' : ''}`;
    // die App misst nach dem Layout (ResizeObserver) – so lange warten, bis nichts überläuft und jede Form zur Messung passt
    await expect
      .poll(async () => (await umschalterMasse(page)).map((m) => `${m.name}:${Math.max(0, m.ueber)}:${m.kurz === !m.passtLang ? 'richtig' : 'falsch'}`), { message: ort })
      .toEqual(['Kontostand', 'Fixkosten', 'Sparziele', 'Versicherung'].map((n) => `${n}:0:richtig`));
    const masse = await umschalterMasse(page);
    for (const m of masse) {
      expect(m.ueber, `${m.name} bei ${ort}`).toBeLessThanOrEqual(0);
      expect(m.hoehe, `${m.name} bei ${ort}`).toBeGreaterThanOrEqual(44);
      expect(m.schrift, `${m.name} bei ${ort}`).toBeGreaterThanOrEqual(13);
      expect(m.sichtbar, `${m.name} bei ${ort}: die gewählte Form ist zu sehen`).toBe(true);
      expect(m.kurzform, m.name).not.toBeNull();
      expect(m.kurz, `${m.name} bei ${ort}: kurz genau dann, wenn der volle Name nicht passt`).toBe(!m.passtLang);
    }
    return masse;
  }

  test('Umschalter (Abschluss-Review I1): Kurzform nur, wenn der Name nicht passt (gemessen); nie Überlauf; voller Name vorgelesen', async ({ page }) => {
    await starteDemo(page, { route: '#/konto' });
    const versicherung = umschalter(page).getByRole('button', { name: 'Versicherung', exact: true });
    await expect(versicherung).toHaveAttribute('title', 'Versicherung');
    for (const name of ['Kontostand', 'Fixkosten', 'Sparziele']) await expect(umschalter(page).getByRole('button', { name, exact: true })).toHaveAttribute('title', name);
    for (const breite of [320, 359, 360, 375, 390]) await umschalterPruefen(page, breite);
    await page.setViewportSize({ width: 320, height: 740 });
    await versicherung.click();
    await expect(page.getByRole('heading', { name: 'Versicherung 🩺' })).toBeVisible();
    await expect(versicherung).toHaveAttribute('aria-pressed', 'true');
    await umschalterPruefen(page, 320);
  });

  test('Umschalter mit breiter Schrift (wie Linux/CI und manche Telefone): bei 320, 360, 375 und 390 px nie Überlauf', async ({ page }) => {
    await starteDemo(page, { route: '#/konto/versicherung' });
    await expect(page.getByRole('heading', { name: 'Versicherung 🩺' })).toBeVisible();
    // über CSSOM (die CSP erlaubt keine eingefügten <style>): Verdana, sonst DejaVu Sans – beide breiter als Segoe UI
    await page.evaluate(() => {
      const blatt = [...document.styleSheets].at(-1);
      blatt.insertRule(`.konto-segment-knopf { font-family: Verdana, 'DejaVu Sans', sans-serif !important; }`, blatt.cssRules.length);
    });
    for (const breite of [320, 360, 375, 390]) {
      const masse = await umschalterPruefen(page, breite, { breiteSchrift: true });
      expect(masse[3].kurz, `Versicherung bei ${breite} px mit breiter Schrift: Kurzform`).toBe(true);
    }
    await umschalter(page).getByRole('button', { name: 'Kontostand', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Kontostand 💶' })).toBeVisible();
    await umschalterPruefen(page, 360, { breiteSchrift: true });
  });

  test('alle Blätter (Review T3 M4): Bedienelemente ≥ 44 px hoch, Knöpfe ≥ 44 px breit, Schrift in Feldern und Knöpfen ≥ 16 px', async ({ page }) => {
    const pruefe = async (name) => {
      const b = blatt(page, name);
      await expect(b).toBeVisible();
      const masse = await b.locator('button:visible, input:visible, select:visible, textarea:visible').evaluateAll((l) =>
        l.map((el) => [el.getAttribute('aria-label') ?? el.textContent ?? el.name, el.tagName, el.getBoundingClientRect().height, el.getBoundingClientRect().width, parseFloat(getComputedStyle(el).fontSize)]),
      );
      expect(masse.length, name).toBeGreaterThan(1);
      for (const [text, tag, hoehe, breite, schrift] of masse) {
        expect(hoehe, `${name}: ${text}`).toBeGreaterThanOrEqual(44);
        if (tag === 'BUTTON') expect(breite, `${name}: ${text}`).toBeGreaterThanOrEqual(44);
        expect(schrift, `${name}: ${text}`).toBeGreaterThanOrEqual(16);
      }
    };
    await oeffne(page);
    await page.getByRole('button', { name: '＋ Rechnung einreichen' }).click();
    await pruefe('＋ Rechnung einreichen');
    await page.keyboard.press('Escape');
    await zeilen(page).first().click();
    await pruefe('🧾 Rechnung ändern');
    await blatt(page, '🧾 Rechnung ändern').getByRole('button', { name: '✓ Erstattung erhalten' }).click();
    await pruefe('✓ Erstattung erhalten');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Polizze bearbeiten' }).click();
    await pruefe('Polizze bearbeiten');
    await page.keyboard.press('Escape');
    await starteDemo(page, { route: '#/konto/kontostand' });
    await page.getByRole('button', { name: 'Beispieldaten entfernen' }).click();
    await page.getByRole('dialog', { name: 'Beispieldaten entfernen?' }).getByRole('button', { name: 'Entfernen' }).click();
    await umschalter(page).getByRole('button', { name: 'Versicherung' }).click();
    const leer = await page.locator('.vs-leer button:visible').evaluateAll((l) => l.map((x) => [x.textContent, x.getBoundingClientRect().height]));
    expect(leer.length).toBe(2);
    for (const [text, hoehe] of leer) expect(hoehe, text).toBeGreaterThanOrEqual(44);
    await page.getByRole('button', { name: 'MedPLUS Privatarzt Basic anlegen' }).click();
    await pruefe('MedPLUS Privatarzt Basic anlegen');
  });
});
