// „Neu“: jede Kachel öffnet ihr Formular; Arzttermin (Mutter-Kind-Pass) speichern und in Heute/Monat/Verlauf wiederfinden.
import { test, expect, starteDemo, starteGoogleVerbunden, tab, erwarteToast, zurueckInDieApp, NETZFEHLER } from './hilfen.js';

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
  const demnaechst = page.locator('section.abschnitt').filter({ has: page.getByRole('heading', { name: 'Demnächst', exact: true }) });
  await expect(demnaechst.locator('button.zeile').nth(1)).toContainText('Mutter-Kind-Pass · 10:30');
  await expect(demnaechst.getByRole('button', { name: 'Mutter-Kind-Pass, Di 20. Okt., 10:30' })).toContainText('🎒 e-card, MuKi-Pass');

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

test('Zurück in die App behält das Getippte (B15)', async ({ page }) => {
  await starteDemo(page, { route: '#/neu' });
  await page.locator('.kachel').filter({ hasText: /^📌Termin$/ }).click();
  const feld = page.getByRole('textbox', { name: 'Weiteres zum Mitnehmen' });
  await feld.fill('Sonnenhut');
  await zurueckInDieApp(page);
  await expect(feld).toHaveValue('Sonnenhut');
  // am nächsten Tag zeichnet die Rückkehr neu („heute“ stimmt wieder) – das Getippte bleibt trotzdem
  await page.clock.setFixedTime(new Date('2026-10-15T08:00:00+02:00'));
  await zurueckInDieApp(page);
  await expect(feld).toHaveValue('Sonnenhut');

  await page.getByRole('button', { name: '‹ Zurück' }).click();
  await page.locator('.kacheln .kachel').filter({ has: page.locator('b', { hasText: /^Sachen für Krabbelstube$/ }) }).click();
  const eigene = page.getByRole('textbox', { name: 'Eigene Sache' });
  await eigene.fill('Sonnenhut');
  await page.getByRole('button', { name: /Pyjamas-Wechsel einrichten/ }).click();
  const pyjamas = page.locator('.pyjamas');
  const heimholen = () => pyjamas.locator('.feld').filter({ hasText: 'Heimholen am' });
  await heimholen().getByRole('button', { name: 'Mi' }).click();
  await pyjamas.getByRole('button', { name: 'Wochen mehr' }).click();
  for (const zeit of ['2026-10-15T09:00:00+02:00', '2026-10-16T08:00:00+02:00']) {
    await page.clock.setFixedTime(new Date(zeit)); // erst derselbe Tag (kein Neuzeichnen), dann der nächste (Neuzeichnen)
    await zurueckInDieApp(page);
    await expect(eigene).toHaveValue('Sonnenhut');
    await expect(pyjamas).toBeVisible();
    await expect(heimholen().locator('.chip.aktiv')).toHaveText('Mi');
    await expect(pyjamas.locator('.stepper-wert')).toHaveText('9 Wochen');
  }
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

test('Termin bearbeiten zeigt die vorhandene Notiz im Feld', async ({ page }) => {
  await starteDemo(page, { route: '#/monat' });
  await page.locator('.raster').getByRole('button', { name: 'Montag, 19. Oktober' }).click();
  await page.getByRole('dialog').locator('.zeile').filter({ hasText: 'Finanzamt' }).getByRole('button', { name: 'Ändern' }).click();
  await expect(page.getByRole('textbox', { name: 'Notiz' })).toHaveValue('Arbeitnehmerveranlagung, 2. Stock');
});

test('Wahl-Chips sagen Bildschirmlesern, was gewählt ist (aria-pressed): Wiederholen und Termin „Für“', async ({ page }) => {
  await starteDemo(page, { route: '#/neu' });
  await page.locator('.kacheln .kachel').filter({ has: page.locator('b', { hasText: /^Sachen für Krabbelstube$/ }) }).click();
  const wahl = page.locator('.serie-wahl');
  await expect(wahl.getByRole('button', { name: 'Einmalig' })).toHaveAttribute('aria-pressed', 'true');
  await expect(wahl.getByRole('button', { name: /Jede Woche/ })).toHaveAttribute('aria-pressed', 'false');
  await wahl.getByRole('button', { name: /Jede Woche/ }).click();
  await expect(page.locator('.serie-wahl').getByRole('button', { name: /Jede Woche/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.serie-wahl').getByRole('button', { name: 'Einmalig' })).toHaveAttribute('aria-pressed', 'false');
  // Knöpfe, die etwas tun statt zu wählen (Vorschläge zum Mitnehmen setzen ihren Zustand selbst), behalten ihre Bedeutung
  await page.getByRole('button', { name: '‹ Zurück' }).click();
  await page.locator('.kachel').filter({ hasText: /^📌Termin$/ }).click();
  const gewaehlt = page.locator('.fuer-chip[aria-pressed="true"]');
  await expect(gewaehlt).toHaveCount(1);
  await expect(page.locator('.fuer-chip:not([aria-pressed])')).toHaveCount(0);
});

test.describe('Speichern mit Google: nur einmal gleichzeitig, ein Fehlschlag ist kein Erfolg (B3, B4)', () => {
  test.use({ erlaubteFehler: NETZFEHLER }); // fehlende versteckte Ereignisse antworten 404, der gestörte Versuch 500

  const VERSUCHE = 4; // calendar/api.js: die erste Anfrage und drei Wiederholungen bei 5xx

  /**
   * Fängt das Schreiben des Termins mit diesem Titel ab: `antwort(route, nr)` beantwortet die nr-te Anfrage (oder reicht sie mit
   * `route.fallback()` an die Attrappe weiter). → { anfragen } = Zahl der Schreibanfragen für diesen Termin.
   */
  async function terminSchreiben(page, titel, antwort) {
    const z = { anfragen: 0 };
    await page.route(/^https:\/\/www\.googleapis\.com\/calendar\/v3\//, (route) => {
      const anfrage = route.request();
      if (anfrage.method() === 'GET' || !(anfrage.postData() ?? '').includes(titel)) return route.fallback();
      z.anfragen += 1;
      return antwort(route, z.anfragen);
    });
    return z;
  }

  async function terminAusfuellen(page, titel) {
    await page.locator('.kachel').filter({ hasText: /^📌Termin$/ }).click();
    await page.getByRole('textbox', { name: 'Titel' }).fill(titel);
    return page.getByRole('button', { name: 'Speichern', exact: true });
  }

  test('Doppeltipp auf Speichern legt den Termin einmal an', async ({ page }) => {
    await starteGoogleVerbunden(page, { route: '#/neu' });
    let antworten; // langsames Netz: Google antwortet erst nach dem zweiten Tipp
    const langsam = new Promise((weiter) => { antworten = weiter; });
    const z = await terminSchreiben(page, 'Zoobesuch', async (route) => {
      await langsam;
      return route.fallback();
    });
    const speichern = await terminAusfuellen(page, 'Zoobesuch');
    await speichern.click();
    await expect(speichern).toBeDisabled();
    await speichern.click({ force: true }); // zweiter Tipp, während der erste noch speichert
    antworten();
    await erwarteToast(page, 'Termin gespeichert ✓');
    await expect(page).toHaveURL(/#\/monat$/);
    expect(z.anfragen).toBe(1);
  });

  test('gescheitertes Speichern: Formular bleibt offen, zweiter Versuch speichert genau einmal', async ({ page }) => {
    await starteGoogleVerbunden(page, { route: '#/neu' });
    const fehler500 = { status: 500, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: { code: 500, message: 'Backend Error' } }) };
    const z = await terminSchreiben(page, 'Zoobesuch', (route, nr) => (nr <= VERSUCHE ? route.fulfill(fehler500) : route.fallback()));
    const speichern = await terminAusfuellen(page, 'Zoobesuch');
    await speichern.click();
    await expect(page.locator('.toast.fehler')).toHaveText('Speichern hat nicht geklappt. Bitte noch einmal versuchen.', { timeout: 15_000 });
    await expect(page).toHaveURL(/#\/neu$/);
    await expect(page.getByRole('textbox', { name: 'Titel' })).toHaveValue('Zoobesuch');
    await expect(page.locator('.toast').filter({ hasText: 'gespeichert ✓' })).toHaveCount(0);
    await expect(speichern).toBeEnabled();
    expect(z.anfragen).toBe(VERSUCHE);

    await speichern.click();
    await erwarteToast(page, 'Termin gespeichert ✓');
    await expect(page).toHaveURL(/#\/monat$/);
    expect(z.anfragen).toBe(VERSUCHE + 1); // genau eine weitere Anfrage – die gelungene
  });
});
