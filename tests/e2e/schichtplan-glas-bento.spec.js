// Schichtplan in den Aussehen (1.2.0, themes/schicht.css): Pinsel-Leiste schwebt mittig über der Tableiste (in Glas echtes Glas, sonst
// deckend), Tippziele ≥ 44 px in Pinsel, Tagesblatt und Schichtarten (Glas/Bento), die Haken für die Bewegung (.sp-pinsel-neu nur beim
// ersten Zeichnen, .sp-gemalt nur am eben gemalten Streifen) und – mit Bewegung – Leiste und Streifen bewegen sich, ohne einen Tipp
// aufzuhalten oder die Leiste seitwärts zu schieben. Läuft in allen drei Projekten; was nur Glas/Bento betrifft, prüft `aussehen`.
import { test, expect, starteDemo } from './hilfen.js';

const zelle = (page, datum) => page.locator(`.sp-zelle[data-datum="${datum}"]`);
const streifen = (page, datum, person) => zelle(page, datum).locator(`.sp-streifen.${person}`);
const leiste = (page) => page.locator('.sp-pinsel');
const art = (page, name) => leiste(page).getByRole('button', { name, exact: true });

/** Kleinste Breite und Höhe aller Knöpfe unter `selektor` (nur sichtbare), mit dem Text des kleinsten. */
const kleinsterKnopf = (page, selektor) =>
  page.evaluate((s) => {
    const masse = [...document.querySelectorAll(`${s} button, ${s} summary`)]
      .filter((b) => b.offsetParent !== null)
      .map((b) => {
        const r = b.getBoundingClientRect();
        return { kante: Math.min(r.width, r.height), text: b.getAttribute('aria-label') || b.textContent.trim() };
      });
    return masse.sort((a, b) => a.kante - b.kante)[0];
  }, selektor);

test('Pinsel: die Leiste schwebt mittig über der Tableiste; Glas mit echtem Glas, Bento deckend; jedes Feld ≥ 44 px', async ({ page, aussehen }) => {
  await starteDemo(page, { route: '#/schicht' });
  await page.getByRole('button', { name: '✏️ Eintragen' }).click();
  await expect(leiste(page)).toBeVisible();
  const m = await page.evaluate(() => {
    const l = document.querySelector('.sp-pinsel');
    const r = l.getBoundingClientRect();
    return { links: r.left, rechts: innerWidth - r.right, unten: r.bottom, tabs: document.querySelector('nav.tabs').getBoundingClientRect().top, blur: getComputedStyle(l).backdropFilter };
  });
  expect(Math.abs(m.links - m.rechts)).toBeLessThanOrEqual(1);
  expect(m.unten).toBeLessThanOrEqual(m.tabs + 1);
  if (aussehen === 'glas') expect(m.blur).toContain('blur');
  else expect(m.blur).toBe('none');
  if (aussehen) {
    expect((await kleinsterKnopf(page, '.sp-pinsel')).kante).toBeGreaterThanOrEqual(44);
    // nur das Kürzel ist zu sehen, der Name bleibt im zugänglichen Namen und steht im Hinweis
    await expect(art(page, 'F Frühdienst')).toBeVisible();
    expect(await art(page, 'F Frühdienst').locator('.sp-pinsel-name').evaluate((s) => s.getBoundingClientRect().width)).toBeLessThan(2);
    await expect(leiste(page).locator('.sp-pinsel-hinweis')).toContainText('F Frühdienst');
    await expect(art(page, '– Frei').locator('.sp-pinsel-name')).toBeVisible();
  }
});

test('Tagesblatt und Schichtarten: jeder Knopf ≥ 44 px (Glas/Bento)', async ({ page, aussehen }) => {
  test.skip(!aussehen, 'Klassisch bleibt wie 1.1.2');
  await starteDemo(page, { route: '#/schicht' });
  await zelle(page, '2026-10-21').click();
  const blatt = page.getByRole('dialog', { name: 'Mittwoch, 21. Oktober' });
  await expect(blatt).toBeVisible();
  await blatt.locator('.sp-tag-karte[data-person="mama"]').getByRole('button', { name: '＋ Dienstbesprechung' }).click();
  await expect(blatt.locator('.sp-tag-zusatz-form')).toBeVisible();
  expect((await kleinsterKnopf(page, '[role="dialog"] .blatt-inhalt')).kante).toBeGreaterThanOrEqual(44);
  await page.keyboard.press('Escape');
  await expect(blatt).toBeHidden();
  await page.getByRole('button', { name: 'Schichtarten bearbeiten' }).click();
  await expect(page.locator('.sp-arten-person').first()).toBeVisible();
  expect((await kleinsterKnopf(page, '.sp-arten-blatt')).kante).toBeGreaterThanOrEqual(44);
  await page.locator('.sp-arten-person[data-person="papa"]').getByRole('button', { name: '＋ Neue Art' }).click();
  await expect(page.locator('.sp-art-form')).toBeVisible();
  expect((await kleinsterKnopf(page, '.sp-art-form')).kante).toBeGreaterThanOrEqual(44);
});

/** Läuft vor den Skripten der Seite: performance.now() steht, bis der Test sie mit `uhrStellen` weiterdreht (Merker in schicht-bewegung.js). */
function uhrAnhalten() {
  window.__uhr = 0;
  performance.now = () => window.__uhr;
}
const uhrStellen = (page, ms) => page.evaluate((t) => (window.__uhr = t), ms);

test('Haken der Bewegung: „sp-pinsel-neu“ nur während des Hereinfederns, „sp-gemalt“ nur am eben gemalten Streifen', async ({ page }) => {
  await page.addInitScript(uhrAnhalten);
  await starteDemo(page, { route: '#/schicht' });
  await page.getByRole('button', { name: '✏️ Eintragen' }).click();
  await expect(leiste(page)).toHaveClass(/sp-pinsel-neu/);
  // ein Neuzeichnen 150 ms nach dem Öffnen: die Leiste federt an derselben Stelle weiter (negative Verzögerung), statt zu springen
  await uhrStellen(page, 150);
  await art(page, 'M Mittagsdienst').click();
  await expect(art(page, 'M Mittagsdienst')).toHaveAttribute('aria-pressed', 'true');
  await expect(leiste(page)).toHaveClass(/sp-pinsel-neu/);
  expect(await leiste(page).evaluate((l) => l.style.getPropertyValue('--sp-pinsel-vor'))).toBe('-150ms');
  await uhrStellen(page, 700);
  await art(page, 'F Frühdienst').click();
  await expect(art(page, 'F Frühdienst')).toHaveAttribute('aria-pressed', 'true');
  await expect(leiste(page)).not.toHaveClass(/sp-pinsel-neu/);
  await art(page, 'M Mittagsdienst').click();
  await zelle(page, '2026-10-08').click();
  await expect(streifen(page, '2026-10-08', 'papa')).toHaveText('M');
  await expect(streifen(page, '2026-10-08', 'papa')).toHaveClass(/sp-gemalt/);
  await expect(page.locator('.sp-gemalt')).toHaveCount(1);
  await zelle(page, '2026-10-15').click();
  await expect(streifen(page, '2026-10-15', 'papa')).toHaveClass(/sp-gemalt/);
  await expect(page.locator('.sp-gemalt')).toHaveCount(1);
  // nochmal dieselbe Art: der Tag wird frei – nichts stempelt
  await zelle(page, '2026-10-15').click();
  await expect(streifen(page, '2026-10-15', 'papa')).toHaveClass(/leer/);
  await expect(page.locator('.sp-gemalt')).toHaveCount(0);
  // nach 600 ms ist der Stempel vorbei: ein Neuzeichnen zeigt ihn nicht wieder
  await zelle(page, '2026-10-22').click();
  await expect(streifen(page, '2026-10-22', 'papa')).toHaveClass(/sp-gemalt/);
  await uhrStellen(page, 1400);
  await art(page, 'F Frühdienst').click();
  await expect(page.locator('.sp-gemalt')).toHaveCount(0);
  await zelle(page, '2026-10-29').click();
  await page.getByRole('button', { name: 'Fertig' }).click();
  await expect(leiste(page)).toHaveCount(0);
  await expect(page.locator('.sp-gemalt')).toHaveCount(0);
});

test('Entscheidungen: „Eintragen“ in Bento traubenlila; Marken im Raster ≥ 10 px; Hinweis und Erinnerung ≥ 16 px; Zeitspannen ohne Umbruch', async ({ page, aussehen }) => {
  test.skip(!aussehen, 'Klassisch bleibt wie 1.1.2');
  await starteDemo(page, { route: '#/schicht' });
  const eintragen = page.getByRole('button', { name: '✏️ Eintragen' });
  if (aussehen === 'bento') {
    const farben = await eintragen.evaluate((b) => {
      const probe = document.createElement('i');
      probe.style.setProperty('color', 'var(--akzent)');
      b.append(probe);
      const akzent = getComputedStyle(probe).color;
      probe.remove();
      return { flaeche: getComputedStyle(b).backgroundColor, akzent };
    });
    expect(farben.flaeche).toBe(farben.akzent);
  }
  const marken = await zelle(page, '2026-10-21').locator('.sp-zusatz').evaluate((m) => parseFloat(getComputedStyle(m).fontSize));
  expect(marken).toBeGreaterThanOrEqual(10);
  await eintragen.click();
  await leiste(page).locator('.sp-pinsel-wer').getByRole('button', { name: '👩 Mama' }).click();
  await leiste(page).getByRole('button', { name: /^DB / }).click();
  const hinweis = leiste(page).locator('.sp-pinsel-hinweis');
  expect(await hinweis.evaluate((h) => parseFloat(getComputedStyle(h).fontSize))).toBeGreaterThanOrEqual(16);
  await expect(hinweis.locator('.sp-zeiten')).toHaveText('18:00–19:30');
  await page.getByRole('button', { name: 'Fertig' }).click();
  await zelle(page, '2026-10-21').click();
  const mama = page.locator('.sp-tag-karte[data-person="mama"]');
  await mama.getByRole('button', { name: '＋ Dienstbesprechung' }).click();
  expect(await mama.locator('.sp-tag-erinnerung').evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
  // „18:00–19:30“ steht in einer Zeile (kein Umbruch nach dem Strich), auch wenn die Zeile davor umbricht
  const zeit = mama.locator('.sp-tag-zusatz-text .sp-zeiten');
  await expect(zeit).toHaveText('18:00–19:30');
  expect(await zeit.evaluate((e) => new Set([...e.getClientRects()].map((x) => Math.round(x.top))).size)).toBe(1);
});

test('Zeitspannen: in Glas/Bento als .sp-zeiten zusammengehalten, in Klassisch unverändert; der Text bleibt derselbe', async ({ page, aussehen }) => {
  await starteDemo(page, { route: '#/schicht' });
  const tag = page.locator('.sp-legende .sp-lg').filter({ hasText: 'Tagdienst' });
  await expect(tag).toHaveText('TTagdienst 07:00–17:45');
  await expect(tag.locator('.sp-zeiten')).toHaveCount(aussehen ? 1 : 0);
});

test.describe('Telefon mit 320 px Breite', () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test('die Marken bleiben auch hier ≥ 10 px (Glas/Bento)', async ({ page, aussehen }) => {
    test.skip(!aussehen, 'Klassisch bleibt wie 1.1.2');
    await starteDemo(page, { route: '#/schicht' });
    const groessen = await page.locator('.sp-zelle[data-datum="2026-10-21"] .sp-marken > *').evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
    expect(groessen.length).toBeGreaterThan(0);
    for (const g of groessen) expect(g).toBeGreaterThanOrEqual(10);
  });
});

test.describe('mit Bewegung', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } });

  test('die Leiste federt herein und bleibt dabei mittig; ein Tipp gleich danach malt sofort; ein gemalter Streifen ploppt', async ({ page, aussehen }) => {
    test.skip(!aussehen, 'Klassisch hat keine Bewegung im Schichtplan');
    await starteDemo(page, { route: '#/schicht' });
    await page.getByRole('button', { name: '✏️ Eintragen' }).click();
    const lauf = await leiste(page).evaluate((l) => {
      const r = l.getBoundingClientRect();
      return { name: getComputedStyle(l).animationName, links: r.left, rechts: innerWidth - r.right };
    });
    expect(lauf.name).toBe(`sp-pinsel-rein-${aussehen}`);
    expect(Math.abs(lauf.links - lauf.rechts)).toBeLessThanOrEqual(1);
    // gleich beim Hereinfedern misst --pinsel-hoehe die echte Höhe (nur verschoben, nie skaliert): ganz unten bleiben 8 px Luft
    await expect
      .poll(() => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pinsel-hoehe'))))
      .toBe(await leiste(page).evaluate((l) => Math.ceil(l.getBoundingClientRect().height)));
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    // gemessen an der Ruhelage der Leiste (offsetTop: ohne die Verschiebung der Animation)
    const luft = await page.evaluate(() => document.querySelector('.sp-pinsel').offsetTop - document.querySelector('.sp-arten').getBoundingClientRect().bottom);
    expect(luft).toBeGreaterThanOrEqual(7);
    await page.evaluate(() => window.scrollTo(0, 0));
    await zelle(page, '2026-10-08').click(); // noch während die Leiste hereinfedert
    await expect(streifen(page, '2026-10-08', 'papa')).toHaveText('F');
    expect(await streifen(page, '2026-10-08', 'papa').evaluate((s) => getComputedStyle(s).animationName)).toBe(`sp-gemalt-${aussehen}`);
  });

  test('„Bewegung: Reduziert“: keine Animation an Leiste und Streifen', async ({ page, aussehen }) => {
    test.skip(!aussehen, 'Klassisch hat keine Bewegung im Schichtplan');
    await starteDemo(page, { route: '#/schicht', speicher: { 'fk.bewegung.v1': 'reduziert' } });
    await page.getByRole('button', { name: '✏️ Eintragen' }).click();
    expect(await leiste(page).evaluate((l) => getComputedStyle(l).animationName)).toBe('none');
    await zelle(page, '2026-10-08').click();
    await expect(streifen(page, '2026-10-08', 'papa')).toHaveText('F');
    expect(await streifen(page, '2026-10-08', 'papa').evaluate((s) => getComputedStyle(s).animationName)).toBe('none');
  });
});
