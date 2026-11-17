// Erster Start ohne Einrichtung: das Willkommen-Menü mit drei Wegen.
import { test, expect, googleAttrappe, NETZFEHLER, WERKTAG } from './hilfen.js';
import { codeErzeugen } from '../../src/calendar/setup.js';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(WERKTAG));
});

test('ohne Konfiguration erscheint Willkommen mit drei Wahlmöglichkeiten', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Willkommen beim Familienkalender' })).toBeVisible();
  const knoepfe = page.locator('.willkommen-knopf');
  await expect(knoepfe).toHaveCount(3);
  await expect(knoepfe.nth(0)).toContainText('Neu einrichten');
  await expect(knoepfe.nth(1)).toContainText('Ich habe einen Code');
  await expect(knoepfe.nth(2)).toContainText('Demo ausprobieren');
  await expect(page.locator('nav.tabs')).toHaveCount(0);
});

test('„Demo ausprobieren“ startet die Demo und merkt sich die Wahl', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Demo ausprobieren/ }).click();
  await expect(page.locator('nav.tabs')).toBeVisible();
  await expect(page.locator('h1.gruss')).toHaveText(/Guten Morgen!/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('fk.config.v1')))).toEqual({ v: 1, modus: 'demo' });
  await page.reload();
  await expect(page.locator('nav.tabs')).toBeVisible();
});

test.describe('Code eingeben', () => {
  test.use({ erlaubteFehler: NETZFEHLER }); // das Google-Skript wird vorgeladen; ohne Netz scheitert das hörbar

  test('„Ich habe einen Code“ lehnt einen falschen Code ab und führt zurück', async ({ page }) => {
    await page.route(/accounts\.google\.com|googleapis\.com/, (r) => r.abort());
    await page.goto('/');
    await page.getByRole('button', { name: /Ich habe einen Code/ }).click();
    await expect(page.getByRole('heading', { name: /Ich habe einen Code/ })).toBeVisible();
    await page.getByRole('textbox', { name: 'Einrichtungscode' }).fill('FK1.abc.def.ghi.000000');
    await page.getByRole('button', { name: 'Weiter mit Google' }).click();
    await expect(page.locator('.fehlertext')).toContainText('Der Code ist unvollständig oder falsch kopiert');
    await page.getByRole('button', { name: '‹ Zurück' }).click();
    await expect(page.locator('.willkommen-knopf')).toHaveCount(3);
  });
});

test.describe('Eingaben bei der Einrichtung (B16)', () => {
  test.use({ erlaubteFehler: NETZFEHLER }); // die Attrappe antwortet mit 404 (Kalender nicht freigegeben)
  const K = (n) => `abc_${n}@group.calendar.google.com`;
  const antwort = (route, status, daten) =>
    route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(daten) });

  test('„Neu einrichten“: die getippte Adresse bleibt nach dem Neuzeichnen stehen', async ({ page }) => {
    await googleAttrappe(page);
    let n = 0;
    await page.route(/^https:\/\/www\.googleapis\.com\/calendar\/v3\/calendars$/, (route) => antwort(route, 200, { id: K((n += 1)) }));
    await page.goto('/');
    await page.getByRole('button', { name: /Neu einrichten/ }).click();
    await page.getByRole('button', { name: 'Mit Google anmelden' }).click();
    await expect(page.getByRole('heading', { name: /Fast fertig/ })).toBeVisible();
    const adresse = page.getByRole('textbox', { name: 'E-Mail-Adresse des anderen Elternteils' });
    await adresse.fill('mama@beispiel');
    await page.getByRole('button', { name: 'Prüfen', exact: true }).click();
    await expect(page.locator('.fehlertext')).toBeVisible(); // ungültig: die Seite zeichnet mit der Meldung neu
    await expect(adresse).toHaveValue('mama@beispiel');
    await adresse.fill('mama@beispiel.at');
    await page.getByRole('button', { name: 'Prüfen', exact: true }).click();
    await page.getByRole('button', { name: 'Ändern' }).click();
    await expect(adresse).toHaveValue('mama@beispiel.at');
  });

  test('„Noch einmal versuchen“ ist aus, solange es läuft, und fragt nur einmal', async ({ page }) => {
    await googleAttrappe(page);
    let versuch = 0;
    const anfragen = [];
    let freigeben;
    const gehalten = new Promise((r) => (freigeben = r));
    await page.route(/^https:\/\/www\.googleapis\.com\/calendar\/v3\/users\/me\/calendarList$/, async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      anfragen.push(versuch);
      if (versuch > 0) await gehalten;
      return antwort(route, 404, { error: { code: 404, message: 'Not Found' } });
    });
    await page.goto('/');
    await page.getByRole('button', { name: /Ich habe einen Code/ }).click();
    await page.getByRole('textbox', { name: 'Einrichtungscode' }).fill(codeErzeugen({ termine: K(1), abwesenheit: K(2), anwesenheit: K(3) }));
    await page.getByRole('button', { name: 'Weiter mit Google' }).click();
    await expect(page.locator('.fehlertext')).toContainText('noch nicht freigegeben');
    versuch = 1;
    await page.getByRole('button', { name: 'Noch einmal versuchen' }).click();
    const knopf = page.getByRole('button', { name: 'Einen Moment …' });
    await expect(knopf).toBeDisabled();
    await knopf.click({ force: true }); // ein zweiter Tipp darf nichts auslösen
    await expect.poll(() => anfragen.filter((v) => v === 1).length).toBe(1);
    await page.waitForTimeout(300);
    expect(anfragen.filter((v) => v === 1)).toHaveLength(1);
    freigeben();
    await expect(page.getByRole('button', { name: 'Noch einmal versuchen' })).toBeEnabled();
    expect(anfragen.filter((v) => v === 1)).toHaveLength(3); // ein Lauf: drei Kalender nacheinander
  });
});
