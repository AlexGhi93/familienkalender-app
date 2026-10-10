// Google-Modus ohne Netz: Start aus dem gespeicherten Stand. Anfragen an Google und den Push-Dienst werden abgebrochen;
// die dadurch erwarteten Netzwerkmeldungen in der Konsole sind erlaubt, alles andere nicht.
import { test, expect, starteGoogleAusSnapshot, NETZFEHLER } from './hilfen.js';

test.use({ erlaubteFehler: NETZFEHLER });

test('Banner oben: gespeicherter Stand, „Verbinden“', async ({ page }) => {
  await starteGoogleAusSnapshot(page);
  const banner = page.locator('#banner .banner');
  await expect(banner).toContainText('Gespeicherter Stand vom Mi 14. Okt., 08:00. Zum Aktualisieren verbinden.');
  await expect(banner.getByRole('button', { name: 'Verbinden' })).toBeVisible();
  await expect(page.locator('h1.gruss')).toHaveText('Guten Morgen! ☀️');
});

test('Mehr: erste Zeile zeigt „Nicht verbunden“ als Warnung', async ({ page }) => {
  await starteGoogleAusSnapshot(page, { route: '#/mehr' });
  const zeile = page.locator('.menue-eintrag[data-id="app"] .menue-zeile');
  await expect(zeile).toContainText('Erinnerungen, Darstellung, Sicherung');
  const status = zeile.locator('.menue-status');
  await expect(status).toHaveText('📴 Nicht verbunden');
  await expect(status).toHaveClass(/warnung/);
  await expect(page.locator('.menue-eintrag')).toHaveCount(9);
});

test('Konto & App: fünf Karten, Status, Code für das andere Elternteil', async ({ page }) => {
  await starteGoogleAusSnapshot(page, { route: '#/app' });
  await expect(page.locator('section.screen > article.karte > h3')).toHaveText(['Konto', '🔔 Erinnerungen', 'Darstellung', 'Sicherung', 'Dieses Telefon zurücksetzen']);
  const konto = page.locator('article.karte').filter({ has: page.getByRole('heading', { name: 'Konto', exact: true }) });
  await expect(konto.locator('.verbindung-block > p').first()).toHaveText('📴 Nicht verbunden');
  await expect(konto).toContainText('Gespeicherter Stand vom Mi 14. Okt., 08:00.');
  await expect(konto.getByRole('button', { name: 'Mit Google anmelden' })).toBeEnabled();
  await expect(konto).toContainText('Du hast den Familienkalender eingerichtet.');
  await konto.getByRole('button', { name: 'Code für das andere Elternteil anzeigen' }).click();
  await expect(konto.locator('.code')).toHaveText(/^FK1\.x_1\.x_1\.x_1\.[0-9a-f]{6}$/);
  await expect(page.locator('article.gefahrenzone').getByRole('button', { name: 'Zurücksetzen …' })).toBeVisible();
});

test('Aktualisieren ohne Anmeldung meldet ehrlich, dass nichts aktualisiert wurde', async ({ page }) => {
  await starteGoogleAusSnapshot(page, { route: '#/app' });
  await page.getByRole('button', { name: 'Aktualisieren' }).click();
  await expect(page.locator('.toast.fehler')).toHaveText('Nicht aktualisiert: Bitte zuerst anmelden.');
});

test('Dieses Telefon zurücksetzen: zwei Rückfragen, danach Willkommen', async ({ page }) => {
  await starteGoogleAusSnapshot(page, { route: '#/app' });
  await page.locator('article.gefahrenzone').getByRole('button', { name: 'Zurücksetzen …' }).click();
  await page.getByRole('dialog', { name: 'Dieses Telefon zurücksetzen?' }).getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('dialog', { name: 'Wirklich zurücksetzen?' }).getByRole('button', { name: 'Ja, zurücksetzen' }).click();
  await expect(page.getByRole('heading', { name: 'Willkommen beim Familienkalender' })).toBeVisible();
  expect(await page.evaluate(() => [localStorage.getItem('fk.config.v1'), localStorage.getItem('fk.snapshot.v1')])).toEqual([null, null]);
});
