// Einkaufsliste aktuell halten: ganz oben herunterziehen (echte Touch-Ereignisse über das Chrome-DevTools-Protokoll),
// „Aktualisiert um …“ und der Abgleich alle 30 Sekunden im Google-Modus (Attrappe von Anmeldung und Kalender, siehe hilfen.js).
import { test, expect, starteDemo, starteGoogleAusSnapshot, starteGoogleVerbunden, tab, NETZFEHLER } from './hilfen.js';

const anzeige = (page) => page.locator('.ek-ziehen');
const stand = (page) => page.locator('.ek-stand');
const zeile = (page, name) => page.locator('.ek-zeile').filter({ has: page.locator('.ek-name', { hasText: new RegExp(`^${name}$`) }) });

/** Einkaufsliste im Format des Kalenders (src/domain/einkauf.js). */
const liste = (...namen) => ({ v: 1, e: namen.map((t, i) => ({ i: `test-e${i}`, t, m: '', g: 0, z: 1_791_900_000 + i })), h: {} });

/**
 * Ein Finger auf dem Bildschirm (Touch über CDP, wie auf dem Telefon): `beruehre` setzt ihn auf die Überschrift der Liste,
 * `ziehe(dy)` bewegt ihn in kleinen Schritten um dy Pixel nach unten, `loslassen()` hebt ihn ab.
 */
async function beruehre(page) {
  const cdp = await page.context().newCDPSession(page);
  const box = await page.getByRole('heading', { name: 'Einkaufsliste 🛒' }).boundingBox();
  const x = Math.round(box.x + box.width / 2);
  const start = Math.round(box.y + box.height / 2);
  let y = start;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  return {
    async ziehe(dy, schritte = 5) {
      const ziel = y + dy;
      for (let i = 1; i <= schritte; i += 1) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: Math.round(y + ((ziel - y) * i) / schritte) }] });
      }
      y = ziel;
    },
    async loslassen() {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
    },
  };
}

test.describe('Herunterziehen in der Demo', () => {
  test('weit genug ziehen und loslassen aktualisiert („Aktualisiert ✓“), danach verschwindet die Anzeige', async ({ page }) => {
    await starteDemo(page, { route: '#/einkauf' });
    await expect(anzeige(page)).toHaveAttribute('data-phase', 'ruhe');
    await expect(anzeige(page)).toHaveAttribute('role', 'status');
    await expect(stand(page)).toBeHidden(); // in der Demo gibt es kein anderes Telefon und nichts abzugleichen

    const finger = await beruehre(page);
    await finger.ziehe(40);
    await expect(anzeige(page)).toHaveAttribute('data-phase', 'ziehen');
    await expect(anzeige(page)).toHaveText('↓ Ziehen zum Aktualisieren');
    await finger.ziehe(60); // insgesamt 100 px: über der Schwelle von 70 px
    await expect(anzeige(page)).toHaveAttribute('data-phase', 'bereit');
    await expect(anzeige(page)).toHaveText('↻ Loslassen zum Aktualisieren');
    await finger.loslassen();
    await expect(anzeige(page)).toHaveAttribute('data-phase', 'fertig');
    await expect(anzeige(page)).toHaveText('Aktualisiert ✓');
    await expect(anzeige(page)).toHaveAttribute('data-phase', 'ruhe');
    await expect(anzeige(page)).toHaveText('');
    await expect(page.locator('.ek-zeile')).toHaveCount(4); // die Liste ist unverändert da
  });

  test('zu kurz gezogen oder wieder zurückgeschoben: kein Aktualisieren', async ({ page }) => {
    await starteDemo(page, { route: '#/einkauf' });
    const finger = await beruehre(page);
    await finger.ziehe(50);
    await expect(anzeige(page)).toHaveAttribute('data-phase', 'ziehen');
    await finger.loslassen();
    await expect(anzeige(page)).toHaveAttribute('data-phase', 'ruhe');
    await expect(anzeige(page)).toHaveText('');

    const zweiter = await beruehre(page);
    await zweiter.ziehe(100);
    await expect(anzeige(page)).toHaveAttribute('data-phase', 'bereit');
    await zweiter.ziehe(-50); // wieder unter die Schwelle
    await expect(anzeige(page)).toHaveAttribute('data-phase', 'ziehen');
    await zweiter.loslassen();
    await expect(anzeige(page)).toHaveAttribute('data-phase', 'ruhe');
  });

  test('bei reduzierter Bewegung feste Höhe, sonst folgt die Anzeige gedämpft dem Finger', async ({ page }) => {
    await starteDemo(page, { route: '#/einkauf' });
    const hoehe = () => anzeige(page).evaluate((el) => el.style.getPropertyValue('--zug'));
    const finger = await beruehre(page);
    await finger.ziehe(50);
    await expect(anzeige(page)).toHaveAttribute('data-phase', 'ziehen');
    expect(await hoehe()).toBe('44px'); // reduzierte Bewegung (Standard der Tests)
    await finger.loslassen();
    await expect(anzeige(page)).toHaveAttribute('data-phase', 'ruhe');
    expect(await hoehe()).toBe('0px');

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const zweiter = await beruehre(page);
    await zweiter.ziehe(50);
    await expect.poll(hoehe).toBe('30px'); // 60 % des Wegs
    await zweiter.ziehe(150);
    await expect.poll(hoehe).toBe('96px'); // höchstens 96 px
    await zweiter.loslassen();
    await expect(anzeige(page)).toHaveText('Aktualisiert ✓');
  });

  test('nur auf der Einkaufsliste: auf anderen Seiten passiert beim Herunterziehen nichts', async ({ page }) => {
    await starteDemo(page, { route: '#/einkauf' });
    await tab(page, 'Heute');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 120 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: 260 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    await tab(page, 'Einkauf');
    await expect(anzeige(page)).toHaveAttribute('data-phase', 'ruhe');
    await expect(anzeige(page)).toHaveText('');
  });
});

test.describe('Google-Modus', () => {
  test.use({ erlaubteFehler: NETZFEHLER });

  test('nur gespeicherter Stand: keine Zeit, Herunterziehen meldet „Nicht mit Google verbunden“', async ({ page }) => {
    await starteGoogleAusSnapshot(page, { route: '#/einkauf' });
    await expect(page.getByRole('heading', { name: 'Einkaufsliste 🛒' })).toBeVisible();
    await expect(stand(page)).toBeHidden();
    const finger = await beruehre(page);
    await finger.ziehe(100);
    await finger.loslassen();
    await expect(anzeige(page)).toHaveText('Nicht mit Google verbunden');
    await expect(anzeige(page)).toHaveAttribute('data-phase', 'ruhe');
  });

  test('verbunden: „Aktualisiert um …“; Herunterziehen holt nur die Einkaufsliste', async ({ page }) => {
    const google = await starteGoogleVerbunden(page, { route: '#/einkauf', einkauf: liste('Milch') });
    await expect(zeile(page, 'Milch')).toBeVisible();
    await expect(stand(page)).toHaveText('Aktualisiert um 08:00');
    const vorher = google.anfragen.length;

    google.setzeEinkauf(liste('Milch', 'Brot')); // das andere Telefon schreibt dazu
    const finger = await beruehre(page);
    await finger.ziehe(100);
    await finger.loslassen();
    await expect(anzeige(page)).toHaveText('Aktualisiert ✓');
    await expect(zeile(page, 'Brot')).toBeVisible();
    // gelesen wird nur das eine Ereignis der Liste, nicht alle Kalender (Schreiben im Hintergrund, z. B. die Urlaub-Checks, zählt hier nicht)
    expect(google.anfragen.slice(vorher).filter((a) => a.startsWith('GET '))).toEqual(['GET /calendars/x_1@group.calendar.google.com/events/fkeinkauf']);
  });

  test('verbunden: alle 30 Sekunden die Liste vom anderen Telefon, nur solange die Einkaufsliste offen ist', async ({ page }) => {
    const google = await starteGoogleVerbunden(page, { route: '#/einkauf', einkauf: liste('Milch'), uhrLaeuft: true });
    const abrufe = () => google.anfragen.filter((a) => a === 'GET /calendars/x_1@group.calendar.google.com/events/fkeinkauf').length;
    await expect(zeile(page, 'Milch')).toBeVisible();
    await expect(stand(page)).toHaveText('Aktualisiert um 08:00');
    const nachDemLaden = abrufe();

    google.setzeEinkauf(liste('Milch', 'Kaffee'));
    await page.clock.fastForward(30_000);
    await expect(zeile(page, 'Kaffee')).toBeVisible();
    expect(abrufe()).toBe(nachDemLaden + 1);

    // nichts Neues: die Liste bleibt, aber die Zeit rückt vor
    await page.clock.fastForward(30_000);
    await expect(stand(page)).toHaveText('Aktualisiert um 08:01');
    expect(abrufe()).toBe(nachDemLaden + 2);

    // auf einer anderen Seite ruht der Abgleich
    await tab(page, 'Heute');
    await expect(page.locator('.einkauf-karte .chip')).toHaveText(['Milch', 'Kaffee']);
    const beimVerlassen = google.anfragen.length;
    google.setzeEinkauf(liste('Milch', 'Kaffee', 'Eier'));
    await page.clock.fastForward(65_000);
    // Wache: diese Anfrage geht nach allen, die bis hierher losgeschickt wurden, durch dieselbe Attrappe
    await page.evaluate(() => fetch('https://www.googleapis.com/calendar/v3/wache').then((r) => r.status));
    expect(google.anfragen.slice(beimVerlassen).filter((a) => a.startsWith('GET '))).toEqual(['GET /wache']);
    await expect(page.locator('.einkauf-karte .chip')).toHaveText(['Milch', 'Kaffee']);

    // zurück auf der Einkaufsliste: der letzte Abgleich ist länger als 30 Sekunden her, also gleich nachsehen
    await tab(page, 'Einkauf');
    await expect(zeile(page, 'Eier')).toBeVisible();
    await expect(stand(page)).toHaveText('Aktualisiert um 08:02');
    expect(abrufe()).toBe(nachDemLaden + 3);
  });
});
