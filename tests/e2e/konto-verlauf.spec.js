// „Kontostand“ (Diagramme, Kennzahlen, Eintragen in der Demo, „Sparen pro Monat“ mit älteren Monaten zum Aufklappen,
// Erklärung der Sonderbeträge) und „Verlauf“ (Suche, Filter, Tag öffnen).
import { test, expect, starteDemo, erwarteToast } from './hilfen.js';

test.describe('Kontostand', () => {
  test('Diagramme: Verlauf mit drei Linien, Balken mit Sonderbeträgen, Kennzahlen', async ({ page }) => {
    await starteDemo(page, { route: '#/konto' });
    await expect(page).toHaveTitle('Familienkalender · Kontostand');
    await expect(page.getByRole('heading', { name: 'Kontostand 💶' })).toBeVisible();

    const zeitraum = page.getByRole('group', { name: 'Zeitraum der Diagramme' });
    await expect(zeitraum.locator('.chip')).toHaveText(['6 Monate', '12 Monate', 'Alles']);
    await expect(zeitraum.locator('.chip.aktiv')).toHaveText('12 Monate');
    await expect(page.locator('.konto-kachel-titel')).toHaveText(['In den letzten 12 Monaten', 'Ø pro Monat', 'Im Plus']);
    await expect(page.locator('.konto-kachel-wert')).toHaveText(['+4.213,50 €', '+1.053,38 €', '3 von 4']);

    const verlauf = page.locator('section.abschnitt').filter({ has: page.getByRole('heading', { name: 'Kontostand-Verlauf' }) }).locator('figure.diagramm');
    await expect(verlauf).toHaveAccessibleName(/^Kontostand-Verlauf: Zusammen von 27\.500 € auf 31\.714 € \(Mai 2026 bis September 2026\)/);
    await expect(verlauf.locator('svg.konto-diagramm')).toBeVisible();
    await expect(verlauf.locator('g.diag-reihe')).toHaveCount(3);
    await expect(verlauf.locator('path.diag-linie:not(.luecke)')).toHaveCount(3);
    await expect(verlauf.locator('g.diag-reihe circle.diag-punkt')).toHaveCount(15);
    await expect(verlauf.locator('.diag-legende-eintrag')).toHaveText(['Zusammen31.713,50 €', 'Papa20.711 €', 'Mama11.002,50 €']);

    const balken = page.locator('section.abschnitt').filter({ has: page.getByRole('heading', { name: 'Veränderung pro Monat (zusammen)' }) });
    await expect(balken.locator('path.konto-balken')).toHaveCount(4);
    await expect(balken.locator('path.konto-balken.minus')).toHaveCount(1);
    await expect(balken.locator('rect.konto-extra')).toHaveCount(2);
    await expect(balken.locator('.diag-legende')).toContainText('Ø +1.015,88 € ohne Extra');
  });

  test('Tooltip mit der Tastatur, Tabelle zum Aufklappen', async ({ page }) => {
    await starteDemo(page, { route: '#/konto' });
    const figur = page.locator('figure.diagramm').first();
    await figur.focus();
    await page.keyboard.press('ArrowRight');
    const tip = figur.locator('.diag-tip');
    await expect(tip).toBeVisible();
    await expect(tip.locator('.diag-tip-titel')).toHaveText('Mai 2026');
    await page.keyboard.press('End');
    await expect(tip.locator('.diag-tip-titel')).toHaveText('September 2026');
    await expect(tip.locator('.diag-tip-zeile').first()).toContainText('31.713,50 €');
    await page.keyboard.press('Escape');
    await expect(tip).toBeHidden();
    await figur.getByText('Als Tabelle anzeigen').click();
    await expect(figur.locator('table tbody tr')).toHaveCount(5);
    await expect(figur.locator('table tbody tr').first().locator('th')).toHaveText('September 2026');
  });

  test('Zeitraum wechseln', async ({ page }) => {
    await starteDemo(page, { route: '#/konto' });
    await page.getByRole('group', { name: 'Zeitraum der Diagramme' }).getByRole('button', { name: '6 Monate' }).click();
    await expect(page.locator('.konto-kachel-titel').first()).toHaveText('In den letzten 6 Monaten');
    await page.getByRole('group', { name: 'Zeitraum der Diagramme' }).getByRole('button', { name: 'Alles' }).click();
    await expect(page.locator('.konto-kachel-titel').first()).toHaveText('Seit Beginn');
  });

  test('Demo: Kontostand eintragen, Liste „Sparen pro Monat“ wächst', async ({ page }) => {
    await starteDemo(page, { route: '#/konto' });
    await expect(page.locator('.formular .karte-text b')).toHaveText('Kontostand Oktober 2026');
    await expect(page.getByRole('combobox', { name: 'Monat für den Kontostand' })).toHaveValue('2026-10');
    const papa = page.locator('.konto-person').filter({ hasText: 'Papa' });
    await papa.getByRole('textbox', { name: 'Kontostand Papa' }).fill('21.000');
    await papa.getByRole('button', { name: 'Speichern' }).click();
    await erwarteToast(page, 'Gespeichert ✓');
    await expect(page.locator('.konto-person.fertig')).toContainText('Papa ✔ 21.000 €');
    await expect(page.locator('.konto-zeile .konto-monat-titel').first()).toHaveText('Oktober 2026');
    await expect(page.getByRole('button', { name: 'Oktober 2026 korrigieren oder löschen' })).toContainText('+289 €');
  });

  test('„Sparen pro Monat“: zuerst die neuesten drei Monate, „Ältere anzeigen (N)“ und „Weniger anzeigen“', async ({ page }) => {
    await starteDemo(page, { route: '#/konto' });
    const sparen = page.locator('section.abschnitt').filter({ has: page.getByRole('heading', { name: 'Sparen pro Monat' }) });
    const monate = sparen.locator('.konto-zeile');
    const knopf = sparen.getByRole('button', { name: /Ältere anzeigen|Weniger anzeigen/ });
    await expect(monate.locator('.konto-monat-titel')).toHaveText(['September 2026', 'August 2026', 'Juli 2026', 'Juni 2026', 'Mai 2026']);
    const sichtbar = () => monate.evaluateAll((els) => els.filter((el) => !el.hidden).map((el) => el.querySelector('.konto-monat-titel').textContent));
    await expect.poll(sichtbar).toEqual(['September 2026', 'August 2026', 'Juli 2026']);
    await expect(monate.nth(3)).toBeHidden();
    await expect(knopf).toHaveText('Ältere anzeigen (2)');
    await expect(knopf).toHaveAttribute('aria-expanded', 'false');

    await knopf.click();
    await expect(monate.nth(4)).toBeVisible();
    await expect.poll(sichtbar).toHaveLength(5);
    await expect(knopf).toHaveText('Weniger anzeigen');
    await expect(knopf).toHaveAttribute('aria-expanded', 'true');
    await expect(knopf).toBeFocused(); // ohne Neuzeichnen: der Fokus bleibt auf dem Knopf

    await knopf.click();
    await expect(monate.nth(3)).toBeHidden();
    await expect(knopf).toHaveText('Ältere anzeigen (2)');

    // ein neuer Monat schiebt den ältesten der drei hinter den Knopf
    const papa = page.locator('.konto-person').filter({ hasText: 'Papa' });
    await papa.getByRole('textbox', { name: 'Kontostand Papa' }).fill('21.000');
    await papa.getByRole('button', { name: 'Speichern' }).click();
    await erwarteToast(page, 'Gespeichert ✓');
    await expect(knopf).toHaveText('Ältere anzeigen (3)');
    await expect.poll(sichtbar).toEqual(['Oktober 2026', 'September 2026', 'August 2026']);
    // aufgeklappt bleibt aufgeklappt, auch nach dem Neuzeichnen der Seite
    await knopf.click();
    await page.getByRole('group', { name: 'Zeitraum der Diagramme' }).getByRole('button', { name: 'Alles' }).click();
    await expect(page.getByRole('group', { name: 'Zeitraum der Diagramme' }).locator('.chip.aktiv')).toHaveText('Alles');
    await expect(knopf).toHaveText('Weniger anzeigen');
    await expect.poll(sichtbar).toHaveLength(6);
  });

  test('Sonderbeträge: die Erklärung steht hinter „ⓘ Was sind Sonderbeträge?“ und bleibt beim Neuzeichnen offen', async ({ page }) => {
    await starteDemo(page, { route: '#/konto' });
    const sonder = page.locator('section.abschnitt').filter({ has: page.getByRole('heading', { name: 'Sonderbeträge' }) });
    const info = sonder.locator('details');
    const text = info.getByText('Das ist nicht der Kontostand');
    await expect(info.locator('summary')).toHaveText('ⓘ Was sind Sonderbeträge?');
    await expect(info).not.toHaveAttribute('open');
    await expect(text).toBeHidden();
    await expect(sonder.getByText('Autoreparatur')).toBeVisible(); // die Liste steht nicht dahinter

    await info.locator('summary').click();
    await expect(info).toHaveAttribute('open', '');
    await expect(text).toBeVisible();
    await expect(text).toContainText('Sonderbeträge ändern keinen Kontostand, werden aber aus der Ersparnis herausgerechnet („ohne Extra“).');

    await page.getByRole('group', { name: 'Zeitraum der Diagramme' }).getByRole('button', { name: '6 Monate' }).click();
    await expect(page.locator('.konto-kachel-titel').first()).toHaveText('In den letzten 6 Monaten');
    await expect(info).toHaveAttribute('open', '');
    await info.locator('summary').click();
    await expect(text).toBeHidden();
  });

  test('unlesbarer Betrag wird gemeldet', async ({ page }) => {
    await starteDemo(page, { route: '#/konto' });
    const mama = page.locator('.konto-person').filter({ hasText: 'Mama' });
    await mama.getByRole('textbox', { name: 'Kontostand Mama' }).fill('zwölf');
    await mama.getByRole('textbox', { name: 'Kontostand Mama' }).press('Enter');
    await erwarteToast(page, 'Bitte einen Betrag eingeben');
  });
});

test.describe('Verlauf', () => {
  test('Liste mit Bevorstehendem und Vergangenem, Suche, Filter-Chips', async ({ page }) => {
    await starteDemo(page, { route: '#/verlauf' });
    await expect(page.getByRole('heading', { name: 'Verlauf 📜' })).toBeVisible();
    const zeilen = page.locator('.verlauf-zeile');
    await expect(page.getByRole('heading', { name: 'Bevorstehend · 6' })).toBeVisible();
    const gesamt = await zeilen.count();
    expect(gesamt).toBeGreaterThan(6);

    const suche = page.getByRole('searchbox', { name: 'Im Verlauf suchen' });
    await suche.fill('impf');
    await expect(zeilen).toHaveCount(2); // Impfung und Kinderarzt (Impfpass im Mitnehmen)
    await suche.fill('IMPFUNG');
    await expect(zeilen).toHaveCount(1);
    await expect(zeilen.first()).toHaveAccessibleName('Impfung (Kind), Do 22. Okt. · 09:15');
    await expect(suche).toBeFocused();
    await suche.fill('gibt es nicht');
    await expect(page.getByText('Nichts gefunden. Probiere einen anderen Filter oder Suchbegriff.')).toBeVisible();
    await suche.fill('');
    await expect(zeilen).toHaveCount(gesamt);

    const filter = page.locator('.verlauf-filter .chip-reihe').first().locator('.chip');
    await expect(filter).toHaveText(['Alle', '🩺 Arzt', '📌 Termine', '✈️ Urlaub', '🤒 Krank', '🧸 Abwesend', '🔒 Schließtage']);
    await filter.filter({ hasText: '🩺 Arzt' }).click();
    await expect(filter.filter({ hasText: '🩺 Arzt' })).toHaveClass(/aktiv/);
    await expect(zeilen).toHaveCount(3);
    await filter.filter({ hasText: '✈️ Urlaub' }).click();
    await expect(zeilen).toHaveCount(2);
    await expect(zeilen.first()).toContainText('Mo 2. Nov. – Fr 13. Nov. · 10 Urlaubstage');
    await filter.filter({ hasText: '🔒 Schließtage' }).click();
    await expect(zeilen).toHaveCount(0);
    await filter.filter({ hasText: 'Alle' }).click();
    await expect(zeilen).toHaveCount(gesamt);
  });

  test('Antippen öffnet den Tag; „Zurück“ führt zu Mehr', async ({ page }) => {
    await starteDemo(page, { route: '#/verlauf' });
    await page.getByRole('button', { name: 'Impfung (Kind), Do 22. Okt. · 09:15' }).click();
    await expect(page.getByRole('dialog', { name: 'Donnerstag, 22. Oktober' })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Schließen' }).click();
    await page.getByRole('button', { name: '‹ Zurück' }).click();
    await expect(page).toHaveURL(/#\/mehr$/);
  });
});
