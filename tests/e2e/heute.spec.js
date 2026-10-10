// „Heute“ in der Demo: Abschnitte, „Demnächst“ als kompakte Zeilen, Schnell-Eintrag des Tages, offene Tage, Wochenende,
// Kontostand am Monatsende.
import { test, expect, starteDemo, erwarteToast } from './hilfen.js';
import { seedDemo } from '../../src/app/seed.js';

const abschnitt = (page, titel) => page.locator('section.abschnitt').filter({ has: page.getByRole('heading', { name: titel, exact: true }) });

test('alle Abschnitte an einem Werktag', async ({ page }) => {
  await starteDemo(page);
  await expect(page).toHaveTitle('Familienkalender · Heute');
  await expect(page.locator('h1.gruss')).toHaveText('Guten Morgen! ☀️');
  await expect(page.locator('p.datum')).toHaveText('Mittwoch, 14. Oktober');
  await expect(page.locator('.kopf .pille')).toHaveText('Krabbelstube');
  const titel = page.locator('section.abschnitt > h2');
  await expect(titel).toHaveText(['📅 Morgen steht an · 1', 'Heute', 'Sachen für Krabbelstube', '🛒 Einkauf · 3', 'Demnächst', 'Urlaub im Kindergartenjahr']);
  await expect(abschnitt(page, '📅 Morgen steht an · 1').locator('.termin-heute')).toContainText('🩺 Kinderarzt');
  await expect(abschnitt(page, 'Demnächst').locator('button.zeile')).toHaveCount(3);
  await expect(abschnitt(page, 'Urlaub im Kindergartenjahr')).toContainText('Noch 2 Wochen offen');
  await expect(page.locator('.countdown')).toHaveText('✈️ Noch 19× schlafen bis zum Urlaub');
  await expect(page.locator('nav.tabs a[aria-current="page"]')).toHaveText(/Heute/);
});

test('„Demnächst“: kompakte Zeilen mit Für wen, Mitnehmen, Kosten und Notiz; Antippen öffnet den Tag', async ({ page }) => {
  await starteDemo(page);
  const zeilen = abschnitt(page, 'Demnächst').locator('button.zeile');
  await expect(zeilen).toHaveCount(3);
  await expect(abschnitt(page, 'Demnächst').locator('article')).toHaveCount(0); // keine Karten mit Chips mehr
  await expect(zeilen.locator('b')).toHaveText(['Finanzamt · 14:00', 'Impfung · 09:15', 'Geburtstag Oma · 15:00']);
  const finanzamt = page.getByRole('button', { name: 'Finanzamt, Mo 19. Okt., 14:00' });
  await expect(finanzamt.locator('small')).toHaveText(['Mo 19. Okt. · 👩 Mama', '🎒 Ausweis, Lohnzettel', '📝 Arbeitnehmerveranlagung, 2. Stock']);
  await expect(page.getByRole('button', { name: 'Impfung, Do 22. Okt., 09:15' }).locator('small')).toHaveText(['Do 22. Okt. · 🧒 Kind', '🎒 e-card, Impfpass · 💶 15 €']);
  await expect(page.getByRole('button', { name: 'Geburtstag Oma, Mo 26. Okt., 15:00' }).locator('small')).toHaveText(['Mo 26. Okt.', '🎒 Geschenk']);

  await page.getByRole('button', { name: 'Impfung, Do 22. Okt., 09:15' }).click();
  const blatt = page.getByRole('dialog', { name: 'Donnerstag, 22. Oktober' });
  await expect(blatt).toBeVisible();
  await expect(blatt.locator('.zeile').filter({ hasText: 'Impfung' })).toBeVisible();
  await blatt.getByRole('button', { name: 'Schließen' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/heute$/); // der Tag öffnet sich als Blatt, die Seite bleibt
});

test('Schnell-Eintrag: vier Knöpfe, „Krank“ trägt heute ein und lässt sich ändern', async ({ page }) => {
  await starteDemo(page);
  const heute = abschnitt(page, 'Heute');
  await expect(heute).toContainText('Wie war’s heute?');
  await expect(heute).toContainText('Krabbelstube: bitte eintragen');
  const knoepfe = heute.locator('.aktionen button');
  await expect(knoepfe).toHaveCount(4);
  await expect(knoepfe).toHaveText([/Anwesend\s*mit Mittagessen/, /Anwesend\s*ohne Essen/, /Krank\s*zu Hause/, /Abwesend/]);
  await knoepfe.filter({ hasText: 'Krank' }).click();
  await erwarteToast(page, 'Eingetragen ✓');
  await expect(heute.locator('.aktionen')).toHaveCount(0);
  await expect(heute.locator('.karte-text b').first()).toHaveText('Krank');
  await heute.getByRole('button', { name: 'Ändern' }).click();
  const blatt = page.getByRole('dialog', { name: 'Mittwoch, 14. Oktober' });
  await expect(blatt).toBeVisible();
  await expect(blatt.locator('.chip.aktiv')).toHaveText('🤒 Krank');
});

test('offene Tage bestätigen, mit Rückgängig', async ({ page }) => {
  await starteDemo(page);
  const karte = page.locator('article.hinweis').filter({ hasText: 'noch nicht eingetragen' });
  await expect(karte).toContainText('1 Tag noch nicht eingetragen');
  await expect(karte).toContainText('Zuletzt: Fr 9. Okt.');
  await karte.getByRole('button', { name: 'Alle bestätigen' }).click();
  const frage = page.getByRole('dialog', { name: 'Alle offenen Tage bestätigen?' });
  await expect(frage).toContainText('1 Tag wird als „Krabbelstube · Mittagessen“ eingetragen.');
  await frage.getByRole('button', { name: 'Bestätigen' }).click();
  await erwarteToast(page, '1 Tag bestätigt ✓');
  await expect(karte).toHaveCount(0);
  await page.locator('.toast').getByRole('button', { name: 'Rückgängig' }).click();
  await erwarteToast(page, 'Rückgängig gemacht');
  await expect(page.locator('article.hinweis').filter({ hasText: 'noch nicht eingetragen' })).toBeVisible();
});

test('„Ansehen“ öffnet den Monat des ersten offenen Tages', async ({ page }) => {
  await starteDemo(page);
  await page.locator('article.hinweis').getByRole('button', { name: 'Ansehen' }).click();
  await expect(page).toHaveURL(/#\/monat$/);
  await expect(page.locator('.monat-kopf h1')).toHaveText('Oktober 2026');
});

test('am Wochenende keine Schnell-Knöpfe', async ({ page }) => {
  await starteDemo(page, { zeit: '2026-10-17T10:00:00+02:00' });
  await expect(page.locator('h1.gruss')).toHaveText('Guten Morgen! ☀️');
  const heute = abschnitt(page, 'Heute');
  await expect(heute).toContainText('Wochenende');
  await expect(heute.locator('.aktionen')).toHaveCount(0);
});

test('am letzten Tag des Monats: Kontostand eintragen (führt zur Seite)', async ({ page }) => {
  await starteDemo(page, { zeit: '2026-09-30T19:00:00+02:00' });
  await expect(page.locator('h1.gruss')).toHaveText('Guten Abend! 🌙');
  const karte = abschnitt(page, '💶 Kontostand für September 2026 eintragen');
  await expect(karte).toContainText('Papa fehlt · Mama fehlt');
  await karte.getByRole('button', { name: 'Kontostand eintragen' }).click();
  await expect(page).toHaveURL(/#\/konto$/);
  await expect(page.getByRole('heading', { name: 'Kontostand 💶' })).toBeVisible();
});

test('Einkauf-Karte zeigt die ersten Artikel und öffnet die Liste', async ({ page }) => {
  await starteDemo(page);
  const karte = page.locator('.einkauf-karte');
  await expect(karte.locator('.chip')).toHaveText(['Milch (2 L)', 'Windeln', 'Nudeln (500 g)']);
  await karte.getByRole('button', { name: 'Liste öffnen' }).click();
  await expect(page).toHaveURL(/#\/einkauf$/);
  await expect(page).toHaveTitle('Familienkalender · Einkauf');
});

test('„Sachen erledigt“ entfernt die Sache, Rückgängig holt sie zurück', async ({ page }) => {
  // Demo vom 14.10., geöffnet am Sonntag davor: „Pyjamas, Hausschuhe“ sind morgen (Mo 19.10.) dran
  await starteDemo(page, { zeit: '2026-10-18T09:00:00+02:00', speicher: { 'fk.demo.v1': seedDemo('2026-10-14') } });
  const sache = page.locator('.sachen .sache').filter({ hasText: 'Hinbringen: Pyjamas, Hausschuhe' });
  await expect(sache.locator('.tag-marke')).toHaveText('Morgen');
  await expect(sache).toContainText('Mo 19. Okt. · 07:30');
  await sache.getByRole('button', { name: 'Erledigt ✓' }).click();
  await erwarteToast(page, 'Erledigt ✓');
  await expect(sache).toHaveCount(0);
  await page.locator('.toast').getByRole('button', { name: 'Rückgängig' }).click();
  await erwarteToast(page, 'Wieder offen');
  await expect(sache).toHaveCount(1);
});
