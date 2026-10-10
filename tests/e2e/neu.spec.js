// „Neu“: jede Kachel öffnet ihr Formular; Arzttermin (Mutter-Kind-Pass) speichern und in Heute/Monat/Verlauf wiederfinden.
import { test, expect, starteDemo, tab, erwarteToast } from './hilfen.js';

const KACHELN = ['Krabbelstube · Mittagessen', 'Krabbelstube · ohne Essen', 'Abwesend', 'Krank', 'Schließtag', 'Urlaub', 'Arzttermin', 'Termin', 'Sachen für Krabbelstube', 'Einkauf'];

test('zehn Kacheln', async ({ page }) => {
  await starteDemo(page, { route: '#/neu' });
  await expect(page.getByRole('heading', { name: 'Was ist los? 🎈' })).toBeVisible();
  await expect(page.locator('.kacheln .kachel b')).toHaveText(KACHELN);
});

for (const titel of KACHELN.filter((t) => t !== 'Einkauf')) {
  test(`Kachel „${titel}“ öffnet ihr Formular, „Zurück“ führt zu den Kacheln`, async ({ page }) => {
    await starteDemo(page, { route: '#/neu' });
    await page.locator('.kacheln .kachel').filter({ has: page.locator('b', { hasText: new RegExp(`^${titel}$`) }) }).click();
    await expect(page.locator('.formular .karte-text b')).toHaveText(titel);
    await expect(page.getByRole('button', { name: 'Speichern', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '‹ Zurück' }).click();
    await expect(page.locator('.kacheln .kachel')).toHaveCount(10);
  });
}

test('Kachel „Einkauf“ führt zur Einkaufsliste', async ({ page }) => {
  await starteDemo(page, { route: '#/neu' });
  await page.locator('.kachel').filter({ hasText: 'Einkauf' }).click();
  await expect(page).toHaveURL(/#\/einkauf$/);
  await expect(page.getByRole('heading', { name: 'Einkaufsliste 🛒' })).toBeVisible();
});

test('Tagestyp für einen Zeitraum: Werktage zählen, speichern, Monat zeigt es', async ({ page }) => {
  await starteDemo(page, { route: '#/neu' });
  await page.locator('.kachel').filter({ hasText: /^🔒Schließtag$/ }).click();
  await page.getByRole('textbox', { name: 'Von', exact: true }).fill('23.10.2026');
  await page.getByRole('textbox', { name: 'Bis', exact: true }).fill('27.10.2026');
  await expect(page.locator('.formular .info')).toHaveText('Gilt für 2 Werktage (Mo–Fr, ohne Feiertage).');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await erwarteToast(page, '2 Tage gespeichert ✓');
  await expect(page).toHaveURL(/#\/monat$/);
  await expect(page.locator('.raster').getByRole('button', { name: 'Freitag, 23. Oktober' }).locator('i')).toHaveText('🔒');
});

test('Arzttermin: Mutter-Kind-Pass, Vorschau mit Zeichenzahl, speichern, in Heute, Monat und Verlauf wiederfinden', async ({ page }) => {
  await starteDemo(page, { route: '#/neu' });
  await page.locator('.kachel').filter({ hasText: 'Arzttermin' }).click();
  const vorschau = page.locator('.vorschau');
  await expect(vorschau.locator('b')).toHaveText('🩺 Kinderarzt (Kind) 09:00 · 🎒 e-card, MuKi-Pass, Impfpass');
  await expect(vorschau).toContainText('57 von 60 Zeichen');

  const art = page.locator('.feld').filter({ has: page.locator('span', { hasText: /^Art$/ }) }).locator('.chip');
  await expect(art).toHaveText(['🩺 Kinderarzt', '💉 Impfung', '👁️ Augenarzt', '🦷 Zahnarzt', '📒 Mutter-Kind-Pass', '🩺 Arzt']);
  await art.filter({ hasText: 'Mutter-Kind-Pass' }).click();
  await expect(art.filter({ hasText: 'Mutter-Kind-Pass' })).toHaveClass(/aktiv/);
  await expect(page.locator('.chip.entfernbar')).toHaveText(['🎒 e-card✕', '🎒 MuKi-Pass✕']);
  await expect(vorschau.locator('b')).toHaveText('📒 Mutter-Kind-Pass (Kind) 09:00 · 🎒 e-card, MuKi-Pass');
  await expect(vorschau).toContainText('53 von 60 Zeichen');

  await page.getByRole('textbox', { name: 'Datum', exact: true }).fill('20.10.2026');
  await expect(page.locator('.eingabe-hinweis').first()).toHaveText('Dienstag, 20. Oktober');
  await page.getByRole('textbox', { name: 'Uhrzeit', exact: true }).fill('10:30');
  await expect(vorschau.locator('b')).toHaveText('📒 Mutter-Kind-Pass (Kind) 10:30 · 🎒 e-card, MuKi-Pass');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await erwarteToast(page, 'Termin gespeichert ✓');

  await expect(page).toHaveURL(/#\/monat$/);
  await expect(page.locator('.raster').getByRole('button', { name: 'Dienstag, 20. Oktober' }).locator('.punkt')).toHaveText('🩺');

  await tab(page, 'Heute');
  await expect(page.locator('section.abschnitt').filter({ hasText: 'Demnächst' }).locator('article.termin').nth(1)).toContainText('Mutter-Kind-Pass · 10:30');

  await page.goto('/#/verlauf');
  const bevorstehend = page.locator('section.abschnitt').filter({ has: page.getByRole('heading', { name: /^Bevorstehend/ }) });
  await expect(bevorstehend.getByRole('button', { name: /Mutter-Kind-Pass \(Kind\), Di 20\. Okt\. · 10:30/ })).toBeVisible();
});

test('Termin: Titel Pflicht, Symbol, Für wen, Betrag, zu lange Vorschau', async ({ page }) => {
  await starteDemo(page, { route: '#/neu' });
  await page.locator('.kachel').filter({ hasText: /^📌Termin$/ }).click();
  const vorschau = page.locator('.vorschau');
  await expect(vorschau).toContainText('Bitte einen Titel eingeben.');
  await page.getByRole('textbox', { name: 'Titel' }).fill('Friseur');
  await page.getByRole('button', { name: 'Symbol ✂️' }).click();
  await expect(page.getByRole('button', { name: 'Symbol ✂️' })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.chip').filter({ hasText: '👩 Mama' }).click();
  await page.locator('.chip').filter({ hasText: '💶 Betrag' }).click();
  await page.getByRole('textbox', { name: 'Betrag in Euro' }).fill('12,50');
  await expect(vorschau.locator('b')).toHaveText('✂️ Friseur (Mama) · 💶 12,50 €');
  await expect(page.locator('small.leise').filter({ hasText: 'Ohne Uhrzeit erinnert nur das Telefon' })).toBeVisible();

  const mitnehmen = page.getByRole('textbox', { name: 'Weiteres zum Mitnehmen' });
  for (const ding of ['Kundenkarte vom Friseursalon', 'Foto der Wunschfrisur', 'Haargummi']) {
    await mitnehmen.fill(ding);
    await mitnehmen.press('Enter');
  }
  await expect(vorschau).toHaveClass(/zu-lang/);
  await expect(vorschau).toContainText('von 60 Zeichen: etwas kürzen');
});

test('ungültiger Betrag: Meldung statt Speichern', async ({ page }) => {
  await starteDemo(page, { route: '#/neu' });
  await page.locator('.kachel').filter({ hasText: /^📌Termin$/ }).click();
  await page.getByRole('textbox', { name: 'Titel' }).fill('Kino');
  await page.locator('.chip').filter({ hasText: '💶 Betrag' }).click();
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await erwarteToast(page, 'Bitte den Betrag eingeben.');
  await expect(page).toHaveURL(/#\/neu$/);
});

test.fixme('Termin bearbeiten zeigt die vorhandene Notiz im Feld', async ({ page }) => {
  // Vermuteter Fehler (src/ui/termin-formular.js:271): `value` wird bei <textarea> als Attribut gesetzt und erscheint nicht im Feld.
  await starteDemo(page, { route: '#/monat' });
  await page.locator('.raster').getByRole('button', { name: 'Montag, 19. Oktober' }).click();
  await page.getByRole('dialog').locator('.zeile').filter({ hasText: 'Finanzamt' }).getByRole('button', { name: 'Ändern' }).click();
  await expect(page.getByRole('textbox', { name: 'Notiz' })).toHaveValue('Arbeitnehmerveranlagung, 2. Stock');
});
