// Google-Modus ohne Netz: Start aus dem gespeicherten Stand. Anfragen an Google und den Push-Dienst werden abgebrochen;
// die dadurch erwarteten Netzwerkmeldungen in der Konsole sind erlaubt, alles andere nicht.
// Dazu der Login-Dienst (src/calendar/auth.js, login-dienst.js): er ist an. Erste Anmeldung über den Code-Weg, danach bleibt das
// Telefon angemeldet (stille Anmeldung beim Start); ist der Dienst nicht erreichbar, gilt der bisherige Token-Weg (eine Stunde).
import { test, expect, starteGoogleAusSnapshot, starteGoogleVerbunden, googleAttrappe, erwarteToast, NETZFEHLER, KONFIG_GOOGLE, WERKTAG, ATTRAPPE_SITZUNG } from './hilfen.js';
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

test.describe('Login-Dienst (an)', () => {
  const DIENST = 'https://familienkalender-login.fk-h2vq8eei.workers.dev';
  const konto = (page) => page.locator('article.karte').filter({ has: page.getByRole('heading', { name: 'Konto', exact: true }) });

  test('ist eingeschaltet: Adresse in der Konfiguration und in der CSP', async ({ page }) => {
    expect(CONFIG.login.dienst).toBe(DIENST);
    await starteGoogleAusSnapshot(page);
    expect(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')).toContain(DIENST);
  });

  test('mit gespeichertem Stand, aber ohne Sitzung: kein Anruf beim Dienst, Hinweis „bleibt angemeldet“, „Verbinden“', async ({ page }) => {
    const anfragen = [];
    page.on('request', (r) => anfragen.push(r.url()));
    await starteGoogleAusSnapshot(page, { route: '#/app' });
    await expect(konto(page)).toContainText('Einmal anmelden – danach bleibt dieses Telefon angemeldet.');
    await expect(konto(page)).not.toContainText('Die Anmeldung gilt eine Stunde');
    await expect(page.locator('#banner')).toContainText('Zum Aktualisieren verbinden.');
    await expect(page.locator('#banner').getByRole('button', { name: 'Verbinden' })).toBeEnabled();
    expect(await page.evaluate(() => localStorage.getItem('fk.login.v1'))).toBeNull();
    expect(anfragen.filter((url) => url.includes('familienkalender-login'))).toEqual([]);
  });

  test('ohne gespeicherten Stand: die große Karte „Mit Google anmelden“ mit Hinweis auf dauerhafte Anmeldung', async ({ page }) => {
    await page.clock.setFixedTime(new Date(WERKTAG));
    await page.route(/accounts\.google\.com|googleapis\.com|workers\.dev/, (r) => r.abort());
    await page.addInitScript((konfig) => localStorage.setItem('fk.config.v1', konfig), JSON.stringify(KONFIG_GOOGLE));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Schön, dass du da bist! 🌸' })).toBeVisible();
    const karte = page.locator('#inhalt article.karte');
    await expect(karte).toContainText('Einmal anmelden – danach bleibt dieses Telefon angemeldet.');
    await expect(karte.getByRole('button', { name: 'Mit Google anmelden' })).toBeEnabled();
    await expect(page.locator('#banner')).toBeEmpty(); // keine Sitzung: keine stille Anmeldung
  });

  test('Anmelden nimmt den Code-Weg über den Dienst, speichert die Sitzung und bleibt angemeldet', async ({ page }) => {
    const google = await starteGoogleVerbunden(page, { route: '#/app' });
    expect(await page.evaluate(() => window.gisAufrufe)).toEqual(['initTokenClient', 'initCodeClient', 'requestCode']); // vorbereitet, dann Code-Weg statt Token
    expect(google.dienste.filter((url) => url.includes('familienkalender-login'))).toEqual([`${DIENST}/v1/anmelden`]);
    expect(google.anfragen).toEqual(expect.arrayContaining(['GET /calendars/x_1@group.calendar.google.com/events/fkeinstellungen']));
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('fk.login.v1')))).toEqual({ v: 1, sitzung: ATTRAPPE_SITZUNG });
    await expect(konto(page).locator('.verbindung-block > p').first()).toHaveText('✅ Verbunden · Dieses Telefon bleibt angemeldet');
    await expect(page.locator('#banner')).toBeEmpty();
  });

  test('nach dem Neuladen: still angemeldet über den Dienst, ohne Tipp und ohne Google-Fenster', async ({ page }) => {
    const google = await starteGoogleVerbunden(page, { route: '#/app' });
    await page.reload();
    await expect(konto(page).locator('.verbindung-block > p').first()).toHaveText('✅ Verbunden · Dieses Telefon bleibt angemeldet');
    await expect(page.locator('#banner')).toBeEmpty();
    expect(await page.evaluate(() => window.gisAufrufe ?? [])).not.toContain('requestCode'); // kein Google-Fenster
    expect(await page.evaluate(() => window.gisAufrufe ?? [])).not.toContain('requestAccessToken');
    expect(google.dienste.filter((url) => url.includes('familienkalender-login'))).toEqual([`${DIENST}/v1/anmelden`, `${DIENST}/v1/token`]);
  });

  test('Dienst nicht erreichbar: Hinweis, der nächste Tipp nimmt den bisherigen Token-Weg (gilt eine Stunde)', async ({ page }) => {
    await page.clock.setFixedTime(new Date(WERKTAG));
    const google = await googleAttrappe(page, { loginDienst: false });
    await page.addInitScript((konfig) => localStorage.setItem('fk.config.v1', konfig), JSON.stringify(KONFIG_GOOGLE));
    await page.goto('/#/app');
    await page.getByRole('button', { name: 'Mit Google anmelden' }).click();
    await expect(page.locator('#inhalt .banner-fehler')).toContainText('Der Anmelde-Dienst ist gerade nicht erreichbar.');
    await page.getByRole('button', { name: 'Mit Google anmelden' }).click();
    await expect(konto(page).locator('.verbindung-block > p').first()).toHaveText('✅ Verbunden · Anmeldung noch 59 Min');
    expect(await page.evaluate(() => window.gisAufrufe)).toEqual(['initTokenClient', 'initCodeClient', 'requestCode', 'requestAccessToken']);
    expect(await page.evaluate(() => localStorage.getItem('fk.login.v1'))).toBeNull();
    expect(google.dienste.filter((url) => url.includes('familienkalender-login'))).toEqual([`${DIENST}/v1/anmelden`]);
  });
});
