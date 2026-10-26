// Visuelle Regression für Klassisch: jede Seite und jedes wichtige Blatt der Demo zur festen Uhrzeit, 390×844, ohne Bewegung.
// Lauf: npm run test:visuell. Die Basis (tests/visuell/__basis__/, git-ignoriert) entsteht NIE auf dem Stand, den sie prüft, sondern
// auf dem letzten Stand vor den Design-Tokens (097adc4): `git worktree add --detach <ordner> 097adc4`, diese Datei und
// playwright.visuell.config.js hineinkopieren, dort `npx playwright test -c playwright.visuell.config.js --update-snapshots`,
// __basis__ zurückkopieren, `git worktree remove <ordner>`. Nichts ist abgedeckt (maskiert): die Uhr steht,
// die Demo ist jedes Mal dieselbe, und es gibt keine Zufallswerte auf den Seiten. Ganze Seiten als ganzes Foto (fullPage),
// Blätter so, wie man sie auf dem Telefon sieht (nur der Bildschirm). Dazu Zustände, die die Aussehen später berühren: Meldung,
// Rückfrage, Formulare, Fehler- und Verbindungszustände, Konflikt, Fokusring, gesperrter Knopf, gestreifter Ersatzdienst.
import { test as basis, expect, starteDemo, starteGoogleAusSnapshot, googleAttrappe, WERKTAG, WERKTAG_DATUM, KONFIG_GOOGLE, NETZFEHLER } from '../e2e/hilfen.js';
import { seedDemo } from '../../src/app/seed.js';

/** Abend desselben Werktags: „Heute“ blickt dann auf morgen („Wer bringt morgen?“, Dienst-Karte mit „Morgen“). */
const ABEND = '2026-10-14T19:00:00+02:00';

/** `darstellung` (Option je Projekt): 'dunkel' legt die Wahl „Dunkel“ der App in localStorage (data-theme="dark"), sonst nichts. */
const test = basis.extend({
  darstellung: [null, { option: true }],
  context: async ({ context, darstellung }, use) => {
    if (darstellung) {
      await context.addInitScript((wert) => {
        try {
          localStorage.setItem('fk.darstellung.v1', wert);
        } catch {
          // Seite ohne Speicher: nichts zu tun
        }
      }, darstellung);
    }
    await use(context);
  },
});

/** Wartet, bis die Schriften geladen sind und nichts mehr lädt, und vergleicht dann das Foto. */
async function foto(page, name, { ganz = true } = {}) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: ganz });
}

const ansichtKonto = (page, name) => page.getByRole('group', { name: 'Ansicht im Konto' }).getByRole('button', { name });

test('Heute', async ({ page }) => {
  await starteDemo(page);
  await expect(page.locator('h1.gruss')).toHaveText('Guten Morgen! ☀️');
  await foto(page, 'heute');
});

test('Morgen (Heute am Abend)', async ({ page }) => {
  await starteDemo(page, { zeit: ABEND });
  await expect(page.locator('h1.gruss')).toHaveText('Guten Abend! 🌙');
  await foto(page, 'morgen');
});

test('Monat', async ({ page }) => {
  await starteDemo(page, { route: '#/monat' });
  await expect(page.locator('.raster')).toBeVisible();
  await foto(page, 'monat');
});

test('Tagesblatt', async ({ page }) => {
  await starteDemo(page, { route: '#/monat' });
  await page.locator('.raster').getByRole('button', { name: 'Donnerstag, 22. Oktober' }).click();
  await expect(page.getByRole('dialog', { name: 'Donnerstag, 22. Oktober' })).toBeVisible();
  await foto(page, 'tagesblatt', { ganz: false });
});

test('Schicht', async ({ page }) => {
  await starteDemo(page, { route: '#/schicht' });
  await expect(page.locator('.sp-zelle[data-datum="2026-10-21"]')).toBeVisible();
  await foto(page, 'schicht');
});

test('Schicht: Pinsel', async ({ page }) => {
  await starteDemo(page, { route: '#/schicht' });
  await page.getByRole('button', { name: '✏️ Eintragen' }).click();
  await page.locator('.sp-pinsel').getByRole('button', { name: 'F Frühdienst', exact: true }).click();
  await expect(page.locator('.sp-pinsel')).toBeVisible();
  await foto(page, 'schicht-pinsel', { ganz: false });
});

test('Schicht: Blatt eines Tages', async ({ page }) => {
  await starteDemo(page, { route: '#/schicht' });
  await page.locator('.sp-zelle[data-datum="2026-10-21"]').click();
  await expect(page.getByRole('dialog', { name: 'Mittwoch, 21. Oktober' })).toBeVisible();
  await foto(page, 'schicht-tag', { ganz: false });
});

test('Konto: Kontostand', async ({ page }) => {
  await starteDemo(page, { route: '#/konto' });
  await expect(ansichtKonto(page, 'Kontostand')).toHaveAttribute('aria-pressed', 'true');
  await foto(page, 'konto-kontostand');
});

test('Konto: Fixkosten', async ({ page }) => {
  await starteDemo(page, { route: '#/konto/fixkosten' });
  await expect(ansichtKonto(page, 'Fixkosten')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '＋ Fixkosten eintragen' })).toBeVisible();
  await foto(page, 'konto-fixkosten');
});

test('Konto: Sparziele', async ({ page }) => {
  await starteDemo(page, { route: '#/konto/sparziele' });
  await expect(ansichtKonto(page, 'Sparziele')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '＋ Neues Sparziel' })).toBeVisible();
  await foto(page, 'konto-sparziele');
});

test('Neu', async ({ page }) => {
  await starteDemo(page, { route: '#/neu' });
  await expect(page.locator('.kacheln .kachel').first()).toBeVisible();
  await foto(page, 'neu');
});

test('Termin-Formular', async ({ page }) => {
  await starteDemo(page, { route: '#/neu' });
  await page.locator('.kachel').filter({ hasText: /^📌Termin$/ }).click();
  await expect(page.getByRole('button', { name: '‹ Zurück' })).toBeVisible();
  await foto(page, 'termin-formular');
});

test('Einkauf', async ({ page }) => {
  await starteDemo(page, { route: '#/einkauf' });
  await expect(page.getByRole('button', { name: 'Milch löschen' })).toBeVisible();
  await foto(page, 'einkauf');
});

test('Urlaub', async ({ page }) => {
  await starteDemo(page, { route: '#/urlaub' });
  await expect(page.getByRole('button', { name: 'Urlaub planen' })).toBeVisible();
  await foto(page, 'urlaub');
});

test('Mehr', async ({ page }) => {
  await starteDemo(page, { route: '#/mehr' });
  await expect(page.locator('.menue-eintrag').first()).toBeVisible();
  await foto(page, 'mehr');
});

test('Konto & App', async ({ page }) => {
  await starteDemo(page, { route: '#/app' });
  await expect(page.getByRole('button', { name: 'Demo zurücksetzen' })).toBeVisible();
  await foto(page, 'konto-und-app');
});

test('Verlauf', async ({ page }) => {
  await starteDemo(page, { route: '#/verlauf' });
  await expect(page.getByRole('heading', { name: 'Verlauf 📜' })).toBeVisible();
  await expect(page.locator('#inhalt')).not.toContainText('Lade …');
  await foto(page, 'verlauf');
});

test('Nachricht-Blatt', async ({ page }) => {
  await starteDemo(page);
  await page.getByRole('button', { name: 'Krabbelstube benachrichtigen', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Nachricht an die Krabbelstube' })).toBeVisible();
  await foto(page, 'nachricht-blatt', { ganz: false });
});

test('Willkommen', async ({ page }) => {
  await page.clock.setFixedTime(new Date(WERKTAG));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Willkommen beim Familienkalender' })).toBeVisible();
  await foto(page, 'willkommen');
});

test('Datenschutz (eigene Seite, nutzt theme.css)', async ({ page }, info) => {
  // Die Seite hat kein Skript und setzt nie data-theme: im Projekt „dunkel-gewaehlt“ wäre das Foto dasselbe wie in „hell“.
  test.skip(info.project.name === 'dunkel-gewaehlt', 'ohne Skript keine gewählte Darstellung');
  await page.goto('/datenschutz.html');
  await expect(page.locator('h1').first()).toBeVisible();
  await foto(page, 'datenschutz');
});

// ---------- Zustände, die spätere Aufgaben (Glas, Bento) berühren: Meldung, Rückfrage, Formulare, Fehler, Fokus, gesperrt ----------

test('Meldung (Toast) mit „Rückgängig“', async ({ page }) => {
  await starteDemo(page, { route: '#/einkauf' });
  await page.getByRole('button', { name: 'Milch löschen' }).click();
  await expect(page.locator('.toast.auf').getByRole('button', { name: 'Rückgängig' })).toBeVisible(); // bleibt 10 s stehen
  await foto(page, 'toast', { ganz: false });
});

test('Rückfrage (Dialog)', async ({ page }) => {
  await starteDemo(page, { route: '#/urlaub' });
  await page.locator('.liste .zeile').filter({ hasText: '2. Nov.' }).getByRole('button', { name: 'Löschen' }).click();
  await expect(page.getByRole('dialog', { name: 'Urlaub löschen?' })).toBeVisible();
  await foto(page, 'rueckfrage', { ganz: false });
});

test('Schichtarten: Liste', async ({ page }) => {
  await starteDemo(page, { route: '#/schicht' });
  await page.getByRole('button', { name: 'Schichtarten bearbeiten' }).click();
  await expect(page.locator('.sp-arten-person[data-person="papa"]')).toBeVisible();
  await foto(page, 'schichtarten', { ganz: false });
});

test('Schichtarten: Formular „Neue Art“', async ({ page }) => {
  await starteDemo(page, { route: '#/schicht' });
  await page.getByRole('button', { name: 'Schichtarten bearbeiten' }).click();
  await page.locator('.sp-arten-person[data-person="papa"]').getByRole('button', { name: '＋ Neue Art' }).click();
  await expect(page.locator('.sp-art-form')).toBeVisible();
  await foto(page, 'schichtart-formular', { ganz: false });
});

test('Schicht: Ersatzdienst E gestreift (Pinsel und Raster)', async ({ page }) => {
  await starteDemo(page, { route: '#/schicht' });
  await page.getByRole('button', { name: '✏️ Eintragen' }).click();
  await page.locator('.sp-pinsel').getByRole('button', { name: 'E Ersatzdienst', exact: true }).click();
  await page.locator('.sp-zelle[data-datum="2026-10-08"]').click();
  await page.locator('.sp-zelle[data-datum="2026-10-15"]').click();
  await expect(page.locator('.sp-zelle[data-datum="2026-10-15"]')).toContainText('E');
  await foto(page, 'schicht-ersatzdienst', { ganz: false });
});

test('Fixkosten: Formular', async ({ page }) => {
  await starteDemo(page, { route: '#/konto/fixkosten' });
  await page.getByRole('button', { name: '＋ Fixkosten eintragen' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await foto(page, 'fixkosten-formular', { ganz: false });
});

test('Sparziele: Formular', async ({ page }) => {
  await starteDemo(page, { route: '#/konto/sparziele' });
  await page.getByRole('button', { name: '＋ Neues Sparziel' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await foto(page, 'sparziel-formular', { ganz: false });
});

test('Sachen-Formular (mit gesperrtem Knopf am Zähler)', async ({ page }) => {
  await starteDemo(page, { route: '#/neu' });
  await page.locator('.kacheln .kachel').filter({ has: page.locator('b', { hasText: /^Sachen für Krabbelstube$/ }) }).click();
  await expect(page.getByRole('button', { name: '‹ Zurück' })).toBeVisible();
  await foto(page, 'sachen-formular');
});

test('Konflikt: Monat mit Marke und Tagesblatt mit Hinweis', async ({ page }) => {
  const demo = seedDemo(WERKTAG_DATUM);
  demo.tage = { ...demo.tage, '2026-10-20': { typ: 'krank', konflikt: true, andere: ['kita_essen'] } };
  await starteDemo(page, { route: '#/monat', speicher: { 'fk.demo.v1': demo } });
  await page.locator('.raster').getByRole('button', { name: /^Dienstag, 20\. Oktober/ }).click();
  await expect(page.locator('.konflikt-hinweis')).toBeVisible();
  await foto(page, 'konflikt', { ganz: false });
});

test('Konflikt: Marke im Monatsraster', async ({ page }) => {
  const demo = seedDemo(WERKTAG_DATUM);
  demo.tage = { ...demo.tage, '2026-10-20': { typ: 'krank', konflikt: true, andere: ['kita_essen'] } };
  await starteDemo(page, { route: '#/monat', speicher: { 'fk.demo.v1': demo } });
  await expect(page.locator('.raster .zelle.konflikt')).toHaveCount(1);
  await foto(page, 'konflikt-monat');
});

test('Gesperrter Knopf: Urlaub im letzten Kindergartenjahr (› aus)', async ({ page }) => {
  await starteDemo(page, { route: '#/urlaub' });
  const weiter = page.getByRole('button', { name: 'Nächstes Kindergartenjahr' });
  while (await weiter.isEnabled()) await weiter.click();
  await expect(weiter).toBeDisabled();
  await foto(page, 'urlaub-gesperrt', { ganz: false });
});

test('Fokusring (Tastatur)', async ({ page }) => {
  await starteDemo(page, { route: '#/monat' });
  await page.keyboard.press('Tab'); // Tastatur benutzt: :focus-visible gilt auch für das folgende focus()
  await page.getByRole('button', { name: 'Nächster Monat' }).focus();
  await expect(page.getByRole('button', { name: 'Nächster Monat' })).toBeFocused();
  await foto(page, 'fokus', { ganz: false });
});

test('Mehr: ein Eintrag aufgeklappt', async ({ page }) => {
  await starteDemo(page, { route: '#/mehr' });
  await page.locator('.menue-eintrag[data-id="familie"] .menue-zeile').click();
  await expect(page.locator('.menue-eintrag[data-id="familie"]')).toHaveClass(/offen/);
  await foto(page, 'mehr-offen', { ganz: false });
});

test.describe('Einrichtung, Verbindung, Fehler', () => {
  test.use({ erlaubteFehler: NETZFEHLER }); // Google ist hier nie erreichbar

  test('Einrichtung „Neu einrichten“', async ({ page }) => {
    await page.clock.setFixedTime(new Date(WERKTAG));
    await page.route(/accounts\.google\.com|googleapis\.com|workers\.dev/, (r) => r.abort());
    await page.goto('/');
    await page.getByRole('button', { name: /Neu einrichten/ }).click();
    await expect(page.getByRole('button', { name: 'Mit Google anmelden' })).toBeVisible();
    await foto(page, 'einrichtung');
  });

  test('Code eingeben: falscher Code (Fehlertext)', async ({ page }) => {
    await page.clock.setFixedTime(new Date(WERKTAG));
    await page.route(/accounts\.google\.com|googleapis\.com|workers\.dev/, (r) => r.abort());
    await page.goto('/');
    await page.getByRole('button', { name: /Ich habe einen Code/ }).click();
    await page.getByRole('textbox', { name: 'Einrichtungscode' }).fill('FK1.abc.def.ghi.000000');
    await page.getByRole('button', { name: 'Weiter mit Google' }).click();
    await expect(page.locator('.fehlertext')).toContainText('Der Code ist unvollständig oder falsch kopiert');
    await foto(page, 'code-fehler');
  });

  test('Google ohne gespeicherten Stand: Karte „Mit Google anmelden“', async ({ page }) => {
    await page.clock.setFixedTime(new Date(WERKTAG));
    await page.route(/accounts\.google\.com|googleapis\.com|workers\.dev/, (r) => r.abort());
    await page.addInitScript((konfig) => localStorage.setItem('fk.config.v1', konfig), JSON.stringify(KONFIG_GOOGLE));
    await page.goto('/');
    await expect(page.locator('#inhalt article.karte').getByRole('button', { name: 'Mit Google anmelden' })).toBeEnabled();
    await foto(page, 'verbinden-karte');
  });

  test('Google mit gespeichertem Stand: Banner „Verbinden“', async ({ page }) => {
    await starteGoogleAusSnapshot(page);
    await expect(page.locator('#banner')).toContainText('Verbinden');
    await foto(page, 'verbindung-banner', { ganz: false });
  });

  test('Anmelde-Dienst nicht erreichbar: Fehler in Konto & App', async ({ page }) => {
    await page.clock.setFixedTime(new Date(WERKTAG));
    await googleAttrappe(page, { loginDienst: false });
    await page.addInitScript((konfig) => localStorage.setItem('fk.config.v1', konfig), JSON.stringify(KONFIG_GOOGLE));
    await page.goto('/#/app');
    await page.getByRole('button', { name: 'Mit Google anmelden' }).click();
    await expect(page.locator('#inhalt .banner-fehler')).toContainText('Der Anmelde-Dienst ist gerade nicht erreichbar.');
    await foto(page, 'verbindung-fehler', { ganz: false });
  });
});
