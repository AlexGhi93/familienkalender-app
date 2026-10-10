// Google-Modus ohne Netz: Start aus dem gespeicherten Stand. Anfragen an Google und den Push-Dienst werden abgebrochen;
// die dadurch erwarteten Netzwerkmeldungen in der Konsole sind erlaubt, alles andere nicht.
// Dazu der Login-Dienst (src/calendar/auth.js, login-dienst.js): er ist noch aus (CONFIG.login.dienst === ''), alles muss sich
// verhalten wie vorher – Token-Weg über das Google-Fenster, „gilt eine Stunde“, keine Sitzung, keine Anfrage an den Dienst.
import { test, expect, starteGoogleAusSnapshot, starteGoogleVerbunden, erwarteToast, NETZFEHLER, KONFIG_GOOGLE, WERKTAG } from './hilfen.js';
import { CONFIG } from '../../src/calendar/config.js';

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
  await expect(page.locator('.menue-eintrag')).toHaveCount(11);
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

test('Konto & App: „Dieses Telefon gehört“ Papa oder Mama (für Erinnerungen nur an wer bringt bzw. holt)', async ({ page }) => {
  await starteGoogleAusSnapshot(page, { route: '#/app' });
  const feld = page.locator('.push-person');
  await expect(feld.locator('> span')).toHaveText('Dieses Telefon gehört');
  await expect(feld.getByRole('button')).toHaveText(['👨 Papa', '👩 Mama']);
  await expect(feld.getByRole('button', { name: '👨 Papa' })).toHaveAttribute('aria-pressed', 'false');
  await expect(feld).toContainText('Ohne Angabe bekommt dieses Telefon alle.');
  const person = () => page.evaluate(() => localStorage.getItem('fk.push.person.v1'));

  await feld.getByRole('button', { name: '👨 Papa' }).click();
  await erwarteToast(page, 'Gespeichert ✓');
  await expect(page.locator('.push-person').getByRole('button', { name: '👨 Papa' })).toHaveAttribute('aria-pressed', 'true');
  expect(await person()).toBe('papa');
  // noch einmal antippen = keine Angabe
  await page.locator('.push-person').getByRole('button', { name: '👨 Papa' }).click();
  await expect(page.locator('.push-person').getByRole('button', { name: '👨 Papa' })).toHaveAttribute('aria-pressed', 'false');
  expect(await person()).toBeNull();
  await page.locator('.push-person').getByRole('button', { name: '👩 Mama' }).click();
  await expect(page.locator('.push-person .chip.aktiv')).toHaveText('👩 Mama');

  await page.reload();
  await expect(page.locator('.push-person .chip.aktiv')).toHaveText('👩 Mama'); // gilt nur für dieses Telefon, bleibt aber gespeichert
});

test.describe('Login-Dienst (noch aus)', () => {
  test('ist ausgeschaltet: keine Adresse in der Konfiguration', () => {
    expect(CONFIG.login.dienst).toBe('');
  });

  test('mit gespeichertem Stand: kein Anruf beim Dienst, keine Sitzung, Hinweis „gilt eine Stunde“ wie bisher', async ({ page }) => {
    const anfragen = [];
    page.on('request', (r) => anfragen.push(r.url()));
    await starteGoogleAusSnapshot(page, { route: '#/app' });
    const konto = page.locator('article.karte').filter({ has: page.getByRole('heading', { name: 'Konto', exact: true }) });
    await expect(konto).toContainText('Die Anmeldung gilt eine Stunde. Nach dem Öffnen der App einmal „Verbinden“ tippen');
    await expect(konto).not.toContainText('bleibt dieses Telefon angemeldet');
    await expect(page.locator('#banner')).toContainText('Zum Aktualisieren verbinden.');
    await expect(page.locator('#banner').getByRole('button', { name: 'Verbinden' })).toBeEnabled();
    expect(await page.evaluate(() => localStorage.getItem('fk.login.v1'))).toBeNull();
    expect(anfragen.filter((url) => url.includes('familienkalender-login'))).toEqual([]);
  });

  test('ohne gespeicherten Stand: die große Karte „Mit Google anmelden“ ohne Hinweis auf dauerhafte Anmeldung', async ({ page }) => {
    await page.clock.setFixedTime(new Date(WERKTAG));
    await page.route(/accounts\.google\.com|googleapis\.com|workers\.dev/, (r) => r.abort());
    await page.addInitScript((konfig) => localStorage.setItem('fk.config.v1', konfig), JSON.stringify(KONFIG_GOOGLE));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Schön, dass du da bist! 🌸' })).toBeVisible();
    const karte = page.locator('#inhalt article.karte');
    await expect(karte.locator('p')).toHaveText(['Tippe auf „Mit Google anmelden“, um den Familienkalender zu laden. Das dauert nur einen Moment.']);
    await expect(karte.getByRole('button', { name: 'Mit Google anmelden' })).toBeEnabled();
    await expect(page.locator('#banner')).toBeEmpty(); // nichts geladen, kein gespeicherter Stand: kein Banner, keine stille Anmeldung
  });

  test('Anmelden nimmt den bisherigen Token-Weg (Google-Fenster), lädt aus Google und gilt eine Stunde', async ({ page }) => {
    const google = await starteGoogleVerbunden(page, { route: '#/app' });
    expect(await page.evaluate(() => window.gisAufrufe)).toEqual(['initTokenClient', 'requestAccessToken']); // kein Code-Weg
    expect(google.anfragen).toEqual(expect.arrayContaining([
      'GET /calendars/x_1@group.calendar.google.com/events/fkeinstellungen',
      'GET /calendars/x_1@group.calendar.google.com/events/fkeinkauf',
      'GET /calendars/x_1@group.calendar.google.com/events/fkkonto',
    ]));
    const konto = page.locator('article.karte').filter({ has: page.getByRole('heading', { name: 'Konto', exact: true }) });
    await expect(konto.locator('.verbindung-block > p').first()).toHaveText('✅ Verbunden · Anmeldung noch 59 Min');
    await expect(page.locator('#banner')).toBeEmpty();
    await page.goto('/#/mehr');
    await expect(page.locator('.menue-eintrag[data-id="app"] .menue-status')).toHaveText('✅ Verbunden mit Google');
    await expect(page.locator('.menue-eintrag[data-id="app"] .menue-status')).not.toHaveClass(/warnung/);
    expect(await page.evaluate(() => localStorage.getItem('fk.login.v1'))).toBeNull();
    expect(google.dienste.filter((url) => url.includes('familienkalender-login'))).toEqual([]);
  });
});
