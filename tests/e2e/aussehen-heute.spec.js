// Glas und Bento (Aufgabe 4): Glastropfen bzw. Blob der Tab-Leiste mit Bewegung – ohne aktive Karte („Neu“, Verlauf, Konto & App) ist
// er weg, ohne Weg zum Rand; zurück auf einer Karte steht er sofort dort, ohne hereinzufegen; zwischen zwei Karten gleitet er weiter.
// Dazu die Haken auf „Heute“ (Datum in Teilen nur in Glas/Bento, Seite, Person des Termins), an denen Glas/Bento hängen.
import { test, expect, starteDemo } from './hilfen.js';

/**
 * Klickt die Karte `href` und schreibt in jedem Bild (rAF, `ms` lang) Zustand und Lage des Tropfens auf: { content, x } mit x =
 * translateX aus der berechneten transform von nav.tabs::before (null, solange es ihn nicht gibt).
 */
function klickUndVerfolge(page, href, ms = 700) {
  return page.evaluate(
    ({ href, ms }) =>
      new Promise((fertig) => {
        const nav = document.querySelector('nav.tabs');
        const lage = () => {
          const cs = getComputedStyle(nav, '::before');
          const m = /matrix\(([^)]+)\)/.exec(cs.transform);
          return { content: cs.content, x: cs.content === 'none' || !m ? null : Number(m[1].split(',')[4]) };
        };
        const proben = [];
        nav.querySelector(`a.tab[href="${href}"]`).click();
        const t0 = performance.now();
        const schritt = () => {
          proben.push(lage());
          if (performance.now() - t0 < ms) requestAnimationFrame(schritt);
          else fertig(proben);
        };
        requestAnimationFrame(schritt);
      }),
    { href, ms },
  );
}

test.describe('Tab-Leiste in Glas und Bento mit Bewegung', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } });
  test.beforeEach(({ aussehen }) => test.skip(!aussehen, 'nur in den Projekten telefon-glas und telefon-bento'));

  test('ohne aktive Karte ist der Tropfen weg (kein Weg zum Rand); zurück steht er sofort an seiner Karte; dazwischen gleitet er', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await page.waitForTimeout(700);

    // Schicht → Neu: ab dem Zeichnen der neuen Seite gibt es keinen Tropfen mehr – also auch keine Fahrt nach links
    const zuNeu = await klickUndVerfolge(page, '#/neu');
    await expect(page).toHaveURL(/#\/neu$/);
    const abNeu = zuNeu.slice(zuNeu.findIndex((p) => p.content === 'none'));
    expect(abNeu.length).toBeGreaterThan(5);
    expect(abNeu.every((p) => p.content === 'none')).toBe(true);

    // Neu → Konto: sobald er da ist, steht er an seinem Ziel (jedes Bild gleich), er fegt nicht vom Rand herein
    const zuKonto = await klickUndVerfolge(page, '#/konto');
    const abKonto = zuKonto.filter((p) => p.content !== 'none');
    expect(abKonto.length).toBeGreaterThan(5);
    const ziel = abKonto.at(-1).x;
    const tabKonto = await page.locator('nav.tabs a.tab[href="#/konto"]').boundingBox();
    const leiste = await page.locator('nav.tabs').boundingBox();
    expect(ziel).toBeGreaterThan(tabKonto.x - leiste.x - 40); // grob an der Karte „Konto“, nicht am linken Rand
    for (const p of abKonto) expect(Math.abs(p.x - ziel)).toBeLessThan(0.5);

    // Konto → Monat: zwischen zwei Karten gleitet er (mindestens ein Zwischenbild liegt zwischen Start und Ziel)
    const zuMonat = await klickUndVerfolge(page, '#/monat');
    const xs = zuMonat.map((p) => p.x).filter((x) => x !== null);
    const ende = xs.at(-1);
    expect(ende).toBeLessThan(ziel);
    expect(xs.some((x) => x > ende + 5 && x < ziel - 5)).toBe(true);

    // Unterseite ohne Karte (Konto & App): wieder weg
    await page.goto('/#/app');
    await expect(page.getByRole('heading', { name: 'Konto & App 👤' })).toBeVisible();
    expect(await page.locator('nav.tabs').evaluate((nav) => getComputedStyle(nav, '::before').content)).toBe('none');
  });
});

test('Heute: Datum in Teilen (Wochentag, Tag, Monat), derselbe Text; Haken für Seite und Person des Termins', async ({ page, aussehen }) => {
  await starteDemo(page);
  const datum = page.locator('.screen.heute-seite > p.datum');
  await expect(datum).toHaveText('Mittwoch, 14. Oktober');
  if (aussehen) {
    await expect(datum.locator('.datum-wt')).toHaveText('Mittwoch,');
    await expect(datum.locator('.datum-tag')).toHaveText('14.');
    await expect(datum.locator('.datum-monat')).toHaveText('Oktober');
  } else {
    await expect(datum.locator('span')).toHaveCount(0); // Klassisch: reiner Text wie bis 1.1.2 (Pixel für Pixel gleich)
  }
  // der Kinderarzt-Termin der Demo ist für das Kind: data-fuer und der Personen-Chip tragen es
  const termin = page.locator('.termin-heute').first();
  await expect(termin).toHaveAttribute('data-fuer', 'kind');
  await expect(termin.locator('.chip.fuer-chip.kind')).toHaveCount(1);
  if (aussehen === 'bento') {
    // Bento: die Uhrzeit trägt die Farbe der Person (Kind gelb), die riesige Tageszahl steht allein
    const [hinten, kind] = await termin.locator('.th-zeit').evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).getPropertyValue('--person-kind').trim()]);
    const probe = await page.evaluate((farbe) => {
      const d = document.createElement('i');
      d.style.color = farbe;
      document.body.append(d);
      const c = getComputedStyle(d).color;
      d.remove();
      return c;
    }, kind);
    expect(hinten).toBe(probe);
    expect(await datum.locator('.datum-tag').evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(80);
    expect(await datum.locator('.datum-trenner').first().evaluate((el) => getComputedStyle(el).display)).toBe('none');
  }
});

test.describe('Tippziele der Tab-Leiste auf einem 375-px-Telefon', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('jede Karte ist mindestens 44 × 44 px groß (auch schwebend in Glas und Bento)', async ({ page }) => {
    await starteDemo(page);
    const groessen = await page.locator('nav.tabs a.tab').evaluateAll((els) => els.map((a) => a.getBoundingClientRect()).map((r) => [r.width, r.height]));
    expect(groessen).toHaveLength(8);
    for (const [b, h] of groessen) {
      expect(b).toBeGreaterThanOrEqual(44);
      expect(h).toBeGreaterThanOrEqual(44);
    }
  });
});
