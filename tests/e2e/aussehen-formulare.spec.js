// Glas und Bento (Aufgabe 8): Neu, Formulare, Einkauf, Urlaub. Prüft die Maße, an denen das Bedienen hängt (Felder ≥ 16 px Schrift,
// damit iOS nicht vergrößert, Ziele ≥ 44 px, sichtbarer Fokus), die Haken in JS (Für-wen-Person, Serie, „gerade abgehakt“, Zeitraum
// je Datum) und die Haken-Bewegung beim Abhaken (nur mit Bewegung, nur einmal je Tipp).
import { test, expect, starteDemo } from './hilfen.js';

/** Berechnete Maße eines Elements: Schriftgröße (px), Breite, Höhe. */
const masse = (locator) =>
  locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { schrift: parseFloat(getComputedStyle(el).fontSize), breite: r.width, hoehe: r.height };
  });

async function oeffneFormular(page, kachel) {
  await starteDemo(page, { route: '#/neu' });
  await page.locator('.kachel', { hasText: kachel }).first().click();
  await expect(page.locator('section.neu-formular .formular')).toBeVisible();
}

test.describe('Formulare in Glas und Bento', () => {
  test.beforeEach(({ aussehen }) => test.skip(!aussehen, 'nur in den Projekten telefon-glas und telefon-bento'));

  test('Termin: Felder ≥ 16 px und ≥ 44 px, Auswahl-Knopf im Feld, ✕ 44 px, Beschriftungen 16 px, Fokus sichtbar', async ({ page }) => {
    await oeffneFormular(page, 'Arzttermin');
    const formular = page.locator('section.neu-formular');
    for (const feld of await formular.locator('input[type="text"], textarea').all()) {
      if (!(await feld.isVisible())) continue;
      const m = await masse(feld);
      expect(m.schrift).toBeGreaterThanOrEqual(16);
      expect(m.hoehe).toBeGreaterThanOrEqual(44);
    }
    for (const span of await formular.locator('.feld > span').all()) expect((await masse(span)).schrift).toBeGreaterThanOrEqual(16);

    // Datum: der Auswahl-Knopf (44 × 44) liegt im Textfeld, rechts
    const datum = formular.getByRole('textbox', { name: 'Datum', exact: true });
    const feld = await datum.boundingBox();
    const knopf = await formular.locator('.picker-knopf').first().boundingBox();
    expect(knopf.width).toBeGreaterThanOrEqual(44);
    expect(knopf.height).toBeGreaterThanOrEqual(44);
    expect(knopf.x).toBeGreaterThan(feld.x + feld.width / 2);
    expect(knopf.x + knopf.width).toBeLessThanOrEqual(feld.x + feld.width + 0.5);
    expect(knopf.y).toBeGreaterThanOrEqual(feld.y - 0.5);
    expect(knopf.y + knopf.height).toBeLessThanOrEqual(feld.y + feld.height + 0.5);

    // entfernbare Chips: ganzer Chip ≥ 44 hoch, das ✕ ein eigener Bereich von 44 px
    const chip = formular.locator('.chip.entfernbar').first();
    expect((await masse(chip)).hoehe).toBeGreaterThanOrEqual(44);
    const x = await masse(chip.locator('.x'));
    expect(x.breite).toBeGreaterThanOrEqual(44);
    for (const c of await formular.locator('button.chip').all()) {
      const m = await masse(c);
      expect(m.hoehe).toBeGreaterThanOrEqual(44);
      expect(m.schrift).toBeGreaterThanOrEqual(16);
    }

    // Fokus: der Rand wird Akzent
    await datum.focus();
    const rand = await datum.evaluate((el) => [getComputedStyle(el).borderTopColor, getComputedStyle(document.documentElement).getPropertyValue('--akzent').trim()]);
    const akzent = await page.evaluate((farbe) => {
      const probe = document.createElement('span');
      probe.style.color = farbe;
      document.body.append(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      return c;
    }, rand[1]);
    expect(rand[0]).toBe(akzent);
  });

  test('Haken: Für-wen-Chips tragen die Person, Bento zeigt die gewählte Person in ihrer Tönung', async ({ page, aussehen }) => {
    await oeffneFormular(page, 'Arzttermin');
    const fuer = page.locator('section.neu-formular .chip.fuer-chip');
    await expect(fuer).toHaveCount(4);
    await expect(page.locator('.chip.fuer-chip.kind')).toHaveClass(/aktiv/);
    await page.locator('.chip.fuer-chip.papa').click();
    await expect(page.locator('.chip.fuer-chip.papa')).toHaveClass(/aktiv/);
    if (aussehen === 'bento') {
      const [hinten, tint] = await page.locator('.chip.fuer-chip.papa').evaluate((el) => {
        const probe = document.createElement('span');
        probe.style.background = 'var(--person-papa-tint)';
        document.body.append(probe);
        const t = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return [getComputedStyle(el).backgroundColor, t];
      });
      expect(hinten).toBe(tint);
    }
  });

  test('Sachen: Wiederholen als zwei gleich breite Hälften (Haken serie-wahl)', async ({ page }) => {
    await oeffneFormular(page, 'Sachen');
    const wahl = page.locator('.serie-wahl');
    await expect(wahl.locator('.chip')).toHaveCount(2);
    const [a, b] = await Promise.all([wahl.locator('.chip').nth(0).boundingBox(), wahl.locator('.chip').nth(1).boundingBox()]);
    expect(Math.abs(a.width - b.width)).toBeLessThan(1);
    expect(Math.abs(a.y - b.y)).toBeLessThan(1);
    await wahl.getByRole('button', { name: /Jede Woche/ }).click();
    await expect(page.locator('.stepper')).toBeVisible();
  });

  test('Urlaub: ein Zeitraum bricht nie mitten im Datum um', async ({ page }) => {
    await starteDemo(page, { route: '#/urlaub' });
    const daten = page.locator('.urlaub-seite b.zeitraum > span');
    expect(await daten.count()).toBeGreaterThanOrEqual(2);
    for (const d of await daten.all()) expect(await d.evaluate((el) => el.getClientRects().length)).toBe(1);
    await expect(page.locator('.urlaub-seite b.zeitraum').first()).toHaveText('Mo 21. Sep. – Fr 25. Sep.');
  });

  test('Einkauf: Eingabe ≥ 16 px, Zeilen und ✕ ≥ 44 px; ohne Bewegung keine Haken-Animation', async ({ page }) => {
    await starteDemo(page, { route: '#/einkauf' });
    for (const f of await page.locator('.ek-eingabe input').all()) {
      const m = await masse(f);
      expect(m.schrift).toBeGreaterThanOrEqual(16);
      expect(m.hoehe).toBeGreaterThanOrEqual(44);
    }
    const plus = await masse(page.locator('.ek-plus'));
    expect(Math.min(plus.breite, plus.hoehe)).toBeGreaterThanOrEqual(44);
    const weg = await masse(page.locator('.ek-weg').first());
    expect(Math.min(weg.breite, weg.hoehe)).toBeGreaterThanOrEqual(44);
    await page.getByRole('checkbox', { name: /Milch/ }).click();
    const haken = page.locator('.ek-zeile.gekauft', { hasText: 'Milch' }).locator('.ek-haken');
    await expect(haken).toHaveText('✓');
    expect(await haken.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  });
});

test.describe('Abhaken mit Bewegung in Glas und Bento', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } });
  test.beforeEach(({ aussehen }) => test.skip(!aussehen, 'nur in den Projekten telefon-glas und telefon-bento'));

  test('der Haken spielt einmal je Tipp; ein späteres Neuzeichnen spielt nichts erneut', async ({ page, aussehen }) => {
    await starteDemo(page, { route: '#/einkauf' });
    await page.getByRole('checkbox', { name: /Milch/ }).click();
    const zeile = page.locator('.ek-zeile.gekauft', { hasText: 'Milch' });
    await expect(zeile).toHaveClass(/ek-frisch/);
    const [name, verzoegerung] = await zeile.locator('.ek-haken').evaluate((el) => [getComputedStyle(el).animationName, getComputedStyle(el).animationDelay]);
    expect(name).toBe(`formulare-haken-${aussehen}`);
    expect(parseFloat(verzoegerung)).toBeLessThanOrEqual(0); // nach einem Neuzeichnen geht es weiter, nicht von vorn
    // die Liste sofort weiter bedienbar: gleich den nächsten Artikel abhaken
    await page.getByRole('checkbox', { name: /Windeln/ }).click();
    await expect(page.locator('.ek-zeile.gekauft', { hasText: 'Windeln' })).toHaveClass(/ek-frisch/);
    await expect(page.locator('.ek-zeile.gekauft', { hasText: 'Milch' })).not.toHaveClass(/ek-frisch/);
    // ein späteres Neuzeichnen ohne Tipp auf eine Zeile (neuer Artikel): keine Zeile ist mehr „frisch“
    await page.waitForTimeout(1000);
    await page.getByRole('textbox', { name: 'Artikel' }).fill('Kaffee');
    await page.getByRole('button', { name: 'Zur Liste hinzufügen' }).click();
    await expect(page.locator('.ek-zeile', { hasText: 'Kaffee' })).toBeVisible();
    await expect(page.locator('.ek-zeile.ek-frisch')).toHaveCount(0);
  });

  test('„Bewegung: Reduziert“: keine Animation am Haken', async ({ page }) => {
    await starteDemo(page, { route: '#/einkauf', speicher: { 'fk.bewegung.v1': 'reduziert' } });
    await page.getByRole('checkbox', { name: /Milch/ }).click();
    const haken = page.locator('.ek-zeile.gekauft', { hasText: 'Milch' }).locator('.ek-haken');
    await expect(haken).toHaveText('✓');
    expect(await haken.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  });
});
