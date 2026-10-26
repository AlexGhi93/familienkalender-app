// Visuelle Regression für Klassisch: jede Seite und jedes wichtige Blatt der Demo zur festen Uhrzeit, 390×844, ohne Bewegung.
// Lauf: npm run test:visuell (Basis neu: npm run test:visuell -- --update-snapshots). Nichts ist abgedeckt (maskiert): die Uhr steht,
// die Demo ist jedes Mal dieselbe, und es gibt keine Zufallswerte auf den Seiten. Ganze Seiten als ganzes Foto (fullPage),
// Blätter so, wie man sie auf dem Telefon sieht (nur der Bildschirm).
import { test as basis, expect, starteDemo, WERKTAG } from '../e2e/hilfen.js';

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

test('Datenschutz (eigene Seite, nutzt theme.css)', async ({ page }) => {
  await page.goto('/datenschutz.html');
  await expect(page.locator('h1').first()).toBeVisible();
  await foto(page, 'datenschutz');
});
